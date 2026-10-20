'use client';

import * as React from 'react';
import {
  Send,
  Sparkles,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  FileAudio,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './use-tutor-chat';

type Attachment = NonNullable<ChatMessage['attachment']>;

interface SelectedFile {
  type: Attachment['type'];
  file: File;
  previewUrl: string;
}

interface ChatComposerProps {
  onSend: (text: string, attachment?: Attachment) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
}

const DEFAULT_PLACEHOLDER = 'Digite sua dúvida, responda ou cole uma imagem (Ctrl+V)...';
const RECORDING_PLACEHOLDER = 'Gravando áudio... Clique no microfone para encerrar';
const MIC_ERROR = 'Não foi possível acessar o microfone. Verifique as permissões.';

export function ChatComposer({ onSend, disabled, placeholder, suggestions }: ChatComposerProps) {
  const [input, setInput] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);
  const [mediaRecorder, setMediaRecorder] = React.useState<MediaRecorder | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<SelectedFile | null>(null);
  const [mediaError, setMediaError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  const toggleRecording = async () => {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `gravacao_${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        setSelectedFile({
          type: 'audio',
          file: audioFile,
          previewUrl: URL.createObjectURL(audioBlob),
        });
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      setMediaError(MIC_ERROR);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: Attachment['type']) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile({ type, file, previewUrl: URL.createObjectURL(file) });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setSelectedFile({ type: 'image', file, previewUrl: URL.createObjectURL(file) });
        }
      }
    }
  };

  const submit = (textToSend: string) => {
    const text =
      textToSend.trim() ||
      (selectedFile?.type === 'audio' ? '🎤 Gravação de Áudio' : selectedFile ? '🖼️ Imagem Anexada' : '');
    if (!text) return;
    onSend(
      text,
      selectedFile
        ? { type: selectedFile.type, url: selectedFile.previewUrl, name: selectedFile.file.name }
        : undefined
    );
    setInput('');
    setSelectedFile(null);
  };

  return (
    <>
      {suggestions && suggestions.length > 0 && (
        <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-brand-orange" />
            Sugestões:
          </span>
          {suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              disabled={disabled}
              onClick={() => onSend(sug)}
              className="text-xs shrink-0 rounded-lg px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-teal hover:text-brand-teal transition-colors cursor-pointer disabled:opacity-50"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {selectedFile && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 truncate">
            {selectedFile.type === 'image' ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-brand-orange" />
            ) : (
              <FileAudio className="h-4 w-4 shrink-0 text-brand-teal" />
            )}
            <span className="truncate font-medium">{selectedFile.file.name}</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            className="p-1 hover:bg-amber-200/50 rounded-full transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5 text-amber-800 dark:text-amber-200" />
          </button>
        </div>
      )}

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {mediaError && (
          <p role="alert" className="mb-2 text-xs text-rose-600">
            {mediaError}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'audio')}
          />
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'image')}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo de áudio"
            className="h-9 w-9 text-slate-500 hover:text-brand-teal hover:bg-brand-teal/10 cursor-pointer"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => imageInputRef.current?.click()}
            title="Anexar imagem de diagrama ou caderno"
            className="h-9 w-9 text-slate-500 hover:text-brand-orange hover:bg-brand-orange/10 cursor-pointer"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant={isRecording ? 'destructive' : 'ghost'}
            size="icon"
            onClick={toggleRecording}
            title={isRecording ? 'Parar gravação' : 'Gravar áudio pelo microfone'}
            className={cn(
              'h-9 w-9 cursor-pointer',
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-slate-500 hover:text-brand-teal hover:bg-brand-teal/10'
            )}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={isRecording ? RECORDING_PLACEHOLDER : (placeholder ?? DEFAULT_PLACEHOLDER)}
            className="flex-1 rounded-xl"
            disabled={disabled}
          />

          <Button
            type="submit"
            disabled={(!input.trim() && !selectedFile) || disabled}
            className="rounded-xl px-4 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
