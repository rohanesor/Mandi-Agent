// Web API type declarations for React Native Web

interface MediaRecorderEvent {
  data: Blob;
}

interface MediaRecorder extends EventTarget {
  state: 'inactive' | 'recording' | 'paused';
  mimeType: string;
  stream: MediaStream;
  start(milliseconds?: number): void;
  stop(): void;
  ondataavailable: ((event: MediaRecorderEvent) => void) | null;
  onstop: (() => void) | null;
  static isTypeSupported(mimeType: string): boolean;
}

interface AudioContext {
  createAnalyser(): AnalyserNode;
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
}

interface AnalyserNode {
  fftSize: number;
  frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array): void;
}

interface MediaStream {
  getTracks(): MediaStreamTrack[];
}

interface MediaStreamTrack {
  stop(): void;
}

interface MediaStreamAudioSourceNode {
  connect(node: AnalyserNode): void;
}

interface BlobOptions {
  type?: string;
  endings?: 'native' | 'transparent';
  lastModified?: number;
}

interface FileReader extends EventTarget {
  result: string | ArrayBuffer | null;
  readAsDataURL(blob: Blob): void;
  onloadend: (() => void) | null;
}

interface Navigator {
  mediaDevices: {
    getUserMedia(constraints: { audio: boolean }): Promise<MediaStream>;
  };
}

declare const MediaRecorder: {
  prototype: MediaRecorder;
  new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
};

declare const AudioContext: {
  prototype: AudioContext;
  new (): AudioContext;
};

declare const FileReader: {
  prototype: FileReader;
  new (): FileReader;
};

declare const navigator: Navigator;

// ──────────────────────────────────────────────────────────────────────────────
// Window & event APIs (available in React Native Web)
// ──────────────────────────────────────────────────────────────────────────────

interface Window {
  confirm(message?: string): boolean;
  location: { href: string };
  addEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
  removeEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
  dispatchEvent(event: any): boolean;
}
declare var window: Window;

declare function addEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
declare function removeEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
declare function dispatchEvent(event: any): boolean;
