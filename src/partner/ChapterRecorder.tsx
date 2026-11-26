import { useEffect, useRef, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon } from '../components';
import { MAX_IMAGES_PER_CHAPTER, MAX_SEGMENT_SECONDS } from '../partner-studio';
import type { ChapterTranscript, ManuscriptDraftView, RecordingChapter } from '../partner-studio';
import { audioFileToPayload, imageFileToPayload, microphoneSupported, startRecording, toWavPayload } from '../platform/partner-media';
import type { AudioPayload, ImagePayload, RecordingSession } from '../platform/partner-media';
import { usePartner } from './partner-context';
import { LevelMeter } from './RecordStep';
import type { UnitStepProps } from './UnitPipeline';

type Mode = 'record' | 'upload' | 'text';
interface Clip { url: string; label: string; blob: Blob; payload?: AudioPayload; source: 'audio' | 'upload' }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ChapterRecorder({ chapter, topicId, draft, updateDraft, readOnly }: UnitStepProps & { chapter: RecordingChapter }) {
  const language = useInterfaceLanguage();
  const { workspace, notify } = usePartner();
  const canRecord = microphoneSupported();
  const [mode, setMode] = useState<Mode>(canRecord ? 'record' : 'upload');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [images, setImages] = useState<ImagePayload[]>([]);
  const [notes, setNotes] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'' | 'transcribing' | 'converting'>('');
  const [error, setError] = useState('');
  const [ticked, setTicked] = useState<number[]>([]);
  const session = useRef<RecordingSession | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const urls = useRef<string[]>([]);
  const transcript = draft.transcripts[chapter.id];
  const modelReady = workspace.modelReady;

  useEffect(() => () => {
    session.current?.cancel();
    window.clearInterval(timer.current);
    urls.current.forEach(u => URL.revokeObjectURL(u));
  }, []);

  const track = (url: string) => { urls.current.push(url); return url; };

  const saveTranscript = (next: ChapterTranscript | undefined) => {
    const transcripts = { ...draft.transcripts };
    if (next) transcripts[chapter.id] = next; else delete transcripts[chapter.id];
    updateDraft({ transcripts });
  };

  const appendTranscript = (text: string, extra: Partial<ChapterTranscript>, source: ChapterTranscript['source']) => {
    const previous = transcript?.text.trim();
    saveTranscript({
      text: previous ? `${previous}\n\n${text.trim()}` : text.trim(),
      formulaChecks: [...(transcript?.formulaChecks ?? []), ...(extra.formulaChecks ?? [])].slice(0, 20),
      warnings: [...(transcript?.warnings ?? []), ...(extra.warnings ?? [])].slice(0, 20),
      source,
      updatedAt: new Date().toISOString(),
    });
  };

  const stopRecording = async () => {
    window.clearInterval(timer.current);
    const active = session.current;
    session.current = null;
    setRecording(false);
    if (!active) return;
    try {
      const blob = await active.stop();
      setClip({ blob, url: track(URL.createObjectURL(blob)), label: ui('剛錄好的一段'), source: 'audio' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const beginRecording = async () => {
    setError('');
    setClip(null);
    try {
      session.current = await startRecording(setLevel);
      const started = Date.now();
      setElapsed(0);
      setRecording(true);
      timer.current = window.setInterval(() => {
        const seconds = (Date.now() - started) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_SEGMENT_SECONDS) void stopRecording();
      }, 250);
    } catch {
      setError('未能使用咪高峰。請在瀏覽器網址列允許咪高峰權限，或改用「上傳音檔」。');
    }
  };

  const pickAudio = (file: File | undefined) => {
    if (!file) return;
    setError('');
    setClip({ blob: file, url: track(URL.createObjectURL(file)), label: file.name, source: 'upload' });
  };

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    const room = MAX_IMAGES_PER_CHAPTER - images.length;
    try {
      const prepared = await Promise.all([...files].slice(0, room).map(f => imageFileToPayload(f)));
      prepared.forEach(p => track(p.previewUrl));
      setImages(list => [...list, ...prepared]);
      if (files.length > room) notify('每段最多附 4 張圖片', 'error');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const transcribe = async () => {
    if (!clip && !images.length) return;
    setError('');
    try {
      let audio: AudioPayload | undefined;
      if (clip) {
        setBusy('converting');
        audio = clip.payload ?? (clip.source === 'upload' && clip.blob instanceof File ? await audioFileToPayload(clip.blob, MAX_SEGMENT_SECONDS) : await toWavPayload(clip.blob, MAX_SEGMENT_SECONDS));
      }
      setBusy('transcribing');
      const result = await api<ManuscriptDraftView>('/partner/transcribe', 'POST', {
        topicId,
        audioBase64: audio?.base64,
        audioFormat: audio?.format,
        boardImages: images.map(i => ({ mimeType: i.mimeType, dataBase64: i.dataBase64 })),
        textNotes: notes.trim() || undefined,
        languageHint: language === 'en' ? 'en' : 'zh-HK',
      });
      appendTranscript(result.manuscriptMarkdown, result, clip?.source ?? 'upload');
      setClip(null);
      setImages([]);
      setNotes('');
      notify('這段已轉寫成文字，錄音已從瀏覽器記憶中移除');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const saveTyped = () => {
    if (!typed.trim()) return;
    appendTranscript(typed, {}, 'text');
    setTyped('');
    notify('已加入這段講稿');
  };

  const remaining = Math.max(0, MAX_SEGMENT_SECONDS - elapsed);
  const disabled = readOnly || Boolean(busy);

  return (
    <article className="ps-chapter" aria-labelledby={`ps-chapter-${chapter.id}`}>
      <header className="ps-chapter-head">
        <h3 id={`ps-chapter-${chapter.id}`}>{ui(chapter.title)}</h3>
        <p className="muted">{ui(chapter.purpose)}</p>
      </header>

      <div className="ps-prompts">
        <p className="small muted">{ui('可以按這些問題講，講完一題就剔一題：')}</p>
        <ul>
          {chapter.prompts.map((prompt, i) => {
            const on = ticked.includes(i);
            return (
              <li key={prompt}>
                <label className={on ? 'on' : ''}>
                  <input type="checkbox" checked={on} onChange={() => setTicked(list => (on ? list.filter(x => x !== i) : [...list, i]))} />
                  <span>{ui(prompt)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="small muted">{ui('建議長度 {0}–{1} 分鐘。', [chapter.minutes[0], chapter.minutes[1]])}{chapter.boardHint ? ` ${ui(chapter.boardHint)}` : ''}</p>
      </div>

      <div className="segmented ps-modes" role="tablist" aria-label={ui('輸入方式')}>
        {(['record', 'upload', 'text'] as Mode[]).map(m => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} disabled={recording || (m === 'record' && !canRecord)} onClick={() => { setMode(m); setError(''); }}>
            {m === 'record' ? ui('直接錄音') : m === 'upload' ? ui('上傳音檔') : ui('直接打字')}
          </button>
        ))}
      </div>

      {mode === 'record' && (
        <div className={`ps-recorder ${recording ? 'live' : ''}`}>
          <button type="button" className="ps-record-btn" disabled={disabled} aria-label={recording ? ui('停止錄音') : ui('開始錄音')} onClick={() => void (recording ? stopRecording() : beginRecording())}>
            <Icon name={recording ? 'square' : 'mic'} size={26} />
          </button>
          <div className="ps-recorder-info">
            <strong className="ps-clock">{clock(elapsed)}</strong>
            <span className="small muted">{recording ? ui('錄音中 · 尚餘 {0}', [clock(remaining)]) : clip ? ui('已錄好，可回放後轉寫') : ui('按圓形按鈕開始，最長 7 分鐘')}</span>
            <LevelMeter level={level} bars={24} />
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <label className="ps-drop">
          <Icon name="upload" size={20} />
          <span>
            <strong>{ui('選擇音檔')}</strong>
            <small>{ui('mp3、wav、m4a 等，每段最長 7 分鐘')}</small>
          </span>
          <input type="file" accept="audio/*" disabled={disabled} onChange={e => { pickAudio(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}

      {mode === 'text' && (
        <div className="ps-typed">
          <label className="field">
            <span>{ui('直接輸入這段講稿')}</span>
            <textarea rows={8} value={typed} disabled={readOnly} onChange={e => setTyped(e.target.value)} placeholder={ui('照你平時上課的講法寫，公式可用 LaTeX，例如 $b^2-4ac$。')} />
          </label>
          <button type="button" className="btn primary" disabled={readOnly || !typed.trim()} onClick={saveTyped}>
            <Icon name="check" size={16} />
            {ui('加入這段講稿')}
          </button>
        </div>
      )}

      {mode !== 'text' && (
        <>
          {clip && (
            <div className="ps-clip">
              <Icon name="headphones" size={16} />
              <span className="ps-clip-name">{clip.label}</span>
              <audio controls src={clip.url} />
              <button type="button" className="btn ghost small-btn" disabled={disabled} onClick={() => setClip(null)}>{ui('捨棄')}</button>
            </div>
          )}

          <div className="ps-images">
            <div className="row-between">
              <span className="small muted">{ui('板書／講義相片（選填，最多 4 張）')}</span>
              <label className={`btn secondary small-btn ${disabled || images.length >= MAX_IMAGES_PER_CHAPTER ? 'is-disabled' : ''}`}>
                <Icon name="image" size={15} />
                {ui('加入相片')}
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={disabled || images.length >= MAX_IMAGES_PER_CHAPTER} onChange={e => { void addImages(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            {images.length > 0 && (
              <ul className="ps-thumbs">
                {images.map((img, i) => (
                  <li key={img.previewUrl}>
                    <img src={img.previewUrl} alt={ui('板書相片 {0}', [i + 1])} />
                    <button type="button" className="icon-btn" aria-label={ui('移除相片')} onClick={() => setImages(list => list.filter(x => x !== img))}>
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="field">
            <span>{ui('補充筆記（選填）')}</span>
            <textarea rows={3} value={notes} disabled={disabled} onChange={e => setNotes(e.target.value)} placeholder={ui('例如：板書第二張圈起的位置是特別條件，學生常漏寫。')} />
          </label>

          <div className="ps-transcribe-row">
            <button type="button" className="btn primary" disabled={disabled || !modelReady || (!clip && !images.length)} onClick={() => void transcribe()}>
              <Icon name="sparkles" size={16} />
              {busy === 'converting' ? ui('正在整理音訊…') : busy === 'transcribing' ? ui('正在轉寫，約需半分鐘至一分鐘…') : ui('轉寫這段')}
            </button>
            {!modelReady && <span className="small muted">{ui('AI 模型未接通，暫時只可「直接打字」。')}</span>}
            {transcript && !busy && <span className="small muted">{ui('新轉寫的內容會接在現有講稿後面。')}</span>}
          </div>
        </>
      )}

      {error && <p className="form-error" role="alert">{ui(error)}</p>}

      {transcript && (
        <section className="ps-transcript" aria-label={ui('這段的講稿')}>
          <div className="row-between">
            <h4>{ui('這段的講稿')}</h4>
            <button type="button" className="btn ghost small-btn" disabled={readOnly} onClick={() => saveTranscript(undefined)}>
              <Icon name="trash" size={14} />
              {ui('清除重來')}
            </button>
          </div>
          <textarea rows={10} value={transcript.text} disabled={readOnly} aria-label={ui('這段的講稿')} onChange={e => saveTranscript({ ...transcript, text: e.target.value, updatedAt: new Date().toISOString() })} />
          {transcript.formulaChecks.length > 0 && (
            <div className="ps-checks amber">
              <strong>{ui('請核對這些公式或條件')}</strong>
              <ul>{transcript.formulaChecks.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {transcript.warnings.length > 0 && (
            <div className="ps-checks red">
              <strong>{ui('版權或合規提醒')}</strong>
              <ul>{transcript.warnings.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
