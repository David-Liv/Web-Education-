// Browser adapter for the Partner Tutor studio: microphone capture, audio normalisation to
// 16 kHz mono WAV (a format multimodal models accept), image downscaling and file download.
// Audio never touches storage here: it lives in memory until it is sent for transcription.

const TARGET_RATE = 16000;
const RAW_UPLOAD_LIMIT = 14 * 1024 * 1024;

export interface AudioPayload { base64: string; format: 'wav' | 'mp3'; seconds: number | null; bytes: number }
export interface ImagePayload { mimeType: 'image/jpeg'; dataBase64: string; previewUrl: string; name: string }

export interface RecordingSession {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export function microphoneSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

export async function startRecording(onLevel: (level: number) => void): Promise<RecordingSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let frame = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3.2));
    frame = requestAnimationFrame(tick);
  };
  tick();
  recorder.start(1000);
  const release = () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach(t => t.stop());
    void context.close();
    onLevel(0);
  };
  return {
    stop: () => new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => { release(); resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
      recorder.onerror = () => { release(); reject(new Error('錄音中斷，請再試一次')); };
      recorder.stop();
    }),
    cancel: () => { recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); release(); },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.readAsDataURL(blob);
  });
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Decode anything the browser can play and re-encode it as 16 kHz mono WAV. */
export async function toWavPayload(blob: Blob, maxSeconds: number): Promise<AudioPayload> {
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error('瀏覽器無法讀取這個音訊檔，請改用 mp3 或 wav');
  } finally {
    void decoder.close();
  }
  if (decoded.duration > maxSeconds + 1) {
    throw new Error('這段音訊超過每段 7 分鐘上限，請分段上傳');
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_RATE), TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), TARGET_RATE);
  return { base64: await blobToBase64(wav), format: 'wav', seconds: decoded.duration, bytes: wav.size };
}

/** mp3/wav under the raw limit go as-is; everything else is normalised to WAV. */
export async function audioFileToPayload(file: File, maxSeconds: number): Promise<AudioPayload> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if ((ext === 'mp3' || ext === 'wav') && file.size <= RAW_UPLOAD_LIMIT) {
    return { base64: await blobToBase64(file), format: ext, seconds: null, bytes: file.size };
  }
  return toWavPayload(file, maxSeconds);
}

export async function imageFileToPayload(file: File, maxEdge = 1600): Promise<ImagePayload> {
  if (!/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('只支援 PNG、JPG 或 WebP 圖片；PDF 講義請先截圖');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('圖片壓縮失敗'))), 'image/jpeg', 0.85));
  return { mimeType: 'image/jpeg', dataBase64: await blobToBase64(blob), previewUrl: URL.createObjectURL(blob), name: file.name };
}

export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function confirmBeforeLeaving(active: boolean): () => void {
  if (!active) return () => {};
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
