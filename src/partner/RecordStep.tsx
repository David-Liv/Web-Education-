import { useEffect, useRef, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { Icon } from '../components';
import { DELIVERY_OPTIONS, RECORDING_CHAPTERS, RECORDING_TIPS } from '../partner-studio';
import type { ChapterId } from '../partner-studio';
import { microphoneSupported, startRecording } from '../platform/partner-media';
import type { RecordingSession } from '../platform/partner-media';
import type { UnitStepProps } from './UnitPipeline';
import { ChapterRecorder } from './ChapterRecorder';

export function LevelMeter({ level, bars = 18 }: { level: number; bars?: number }) {
  return (
    <span className="ps-meter" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} className={level * bars > i ? 'on' : ''} />
      ))}
    </span>
  );
}

export function PrepareStep({ draft, updateDraft, go, current }: UnitStepProps) {
  useInterfaceLanguage();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [micError, setMicError] = useState('');
  const session = useRef<RecordingSession | null>(null);

  useEffect(() => () => session.current?.cancel(), []);

  const toggleTest = async () => {
    if (testing) {
      session.current?.cancel();
      session.current = null;
      setTesting(false);
      return;
    }
    setMicError('');
    setHeard(false);
    try {
      session.current = await startRecording(value => {
        setLevel(value);
        if (value > 0.25) setHeard(true);
      });
      setTesting(true);
    } catch {
      setMicError('未能使用咪高峰。請在瀏覽器網址列允許咪高峰權限，或改用「上傳音檔」。');
    }
  };

  return (
    <div className="ps-prepare">
      <div className="ps-step-head">
        <h2>{ui('開始前花一分鐘準備')}</h2>
        <p className="muted">{ui('你會按五段提綱錄音。每段對應方法包的一個部分，平台會把它們整理成講稿讓你核對。')}</p>
      </div>

      <div className="ps-prepare-grid">
        <section className="ps-panel">
          <h3>{ui('學生會怎樣上你的課？')}</h3>
          <div className="ps-choice-list" role="radiogroup" aria-label={ui('教學形式')}>
            {DELIVERY_OPTIONS.map(option => (
              <label key={option.id} className={`ps-choice ${draft.delivery === option.id ? 'selected' : ''}`}>
                <input type="radio" name="delivery" checked={draft.delivery === option.id} onChange={() => updateDraft({ delivery: option.id })} />
                <span>
                  <strong>{ui(option.label)}</strong>
                  <small>{ui(option.detail)}</small>
                </span>
              </label>
            ))}
          </div>
          {current && <p className="small muted">{ui('已有方法包時，教學形式可在「方法包」步驟修改。')}</p>}
        </section>

        <section className="ps-panel">
          <h3>{ui('試一試咪高峰')}</h3>
          {microphoneSupported() ? (
            <div className="ps-miccheck">
              <button type="button" className={`btn ${testing ? 'secondary' : 'primary'}`} onClick={() => void toggleTest()}>
                <Icon name={testing ? 'square' : 'mic'} size={16} />
                {testing ? ui('停止試音') : ui('開始試音')}
              </button>
              <LevelMeter level={level} />
              <p className="small muted" role="status">
                {testing ? (heard ? ui('收音正常，可以開始錄音。') : ui('請說幾句話，綠色條應該會跳動。')) : ui('試音不會錄低任何聲音。')}
              </p>
            </div>
          ) : (
            <p className="small muted">{ui('這個瀏覽器不支援直接錄音，你可以用手機錄好後在下一步上傳音檔。')}</p>
          )}
          {micError && <p className="form-error small" role="alert">{ui(micError)}</p>}
        </section>
      </div>

      <section className="ps-panel">
        <h3>{ui('錄音小提示')}</h3>
        <ul className="ps-tips">
          {RECORDING_TIPS.map(tip => (
            <li key={tip}><Icon name="check" size={14} />{ui(tip)}</li>
          ))}
        </ul>
      </section>

      <section className="ps-panel">
        <h3>{ui('五段提綱')}</h3>
        <ol className="ps-outline">
          {RECORDING_CHAPTERS.map(c => (
            <li key={c.id}>
              <strong>{ui(c.title)}</strong>
              <span>{ui(c.purpose)}</span>
              <em>{ui('{0}–{1} 分鐘', [c.minutes[0], c.minutes[1]])}</em>
            </li>
          ))}
        </ol>
      </section>

      <div className="ps-step-actions">
        <button type="button" className="btn primary" onClick={() => go('record')}>
          {ui('開始錄第一段')}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}

export function RecordStep(props: UnitStepProps) {
  useInterfaceLanguage();
  const { draft, go } = props;
  const firstOpen = RECORDING_CHAPTERS.find(c => !draft.transcripts[c.id]?.text.trim())?.id ?? 'style';
  const [chapterId, setChapterId] = useState<ChapterId>(firstOpen);
  const index = RECORDING_CHAPTERS.findIndex(c => c.id === chapterId);
  const doneCount = RECORDING_CHAPTERS.filter(c => draft.transcripts[c.id]?.text.trim()).length;
  const next = RECORDING_CHAPTERS[index + 1];

  return (
    <div className="ps-record">
      <div className="ps-step-head">
        <h2>{ui('按提綱錄音或上傳講義')}</h2>
        <p className="muted">{ui('每段錄完按「轉寫這段」，AI 會把錄音和板書整理成文字，你可以即時修改。已完成 {0} / 5 段。', [doneCount])}</p>
      </div>
      <div className="ps-record-layout">
        <nav className="ps-chapters" aria-label={ui('錄音段落')}>
          <ol>
            {RECORDING_CHAPTERS.map((c, i) => {
              const done = Boolean(draft.transcripts[c.id]?.text.trim());
              return (
                <li key={c.id}>
                  <button type="button" className={c.id === chapterId ? 'active' : ''} aria-current={c.id === chapterId ? 'true' : undefined} onClick={() => setChapterId(c.id)}>
                    <span className={`ps-chapter-dot ${done ? 'done' : ''}`} aria-hidden="true">{done ? <Icon name="check" size={12} /> : i + 1}</span>
                    <span className="ps-chapter-text">
                      <strong>{ui(c.title)}</strong>
                      <small>{done ? ui('已有講稿') : ui('{0}–{1} 分鐘', [c.minutes[0], c.minutes[1]])}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <ChapterRecorder key={chapterId} chapter={RECORDING_CHAPTERS[index]} {...props} />
      </div>
      <div className="ps-step-actions">
        {next && (
          <button type="button" className="btn secondary" onClick={() => setChapterId(next.id)}>
            {ui('下一段：{0}', [ui(next.title)])}
            <Icon name="arrow" size={16} />
          </button>
        )}
        <button type="button" className="btn primary" disabled={doneCount === 0} onClick={() => go('manuscript')}>
          {doneCount < 5 ? ui('先去校對講稿（{0} / 5 段）', [doneCount]) : ui('五段完成，去校對講稿')}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
