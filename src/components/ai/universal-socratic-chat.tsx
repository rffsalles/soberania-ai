'use client';

import * as React from 'react';
import {
  Send,
  Sparkles,
  BookOpen,
  Bot,
  User,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  FileAudio,
  X,
  FileText,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { AgendaType } from '@/domains/agendas/types';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'teacher';
  text: string;
  citation?: string;
  attachment?: {
    type: 'audio' | 'image';
    url: string;
    name?: string;
  };
  isGuardrailViolation?: boolean;
  timestamp: string;
}

export interface UniversalSocraticChatProps {
  agendaType: AgendaType;
  subjectId?: string;
  teachingPlanId?: string;
  lessonPlanId?: string;
  assessmentId?: string;
  sessionId?: string;
  onOpenMinutesModal?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'teacher',
    text: 'Olá! Sou a Tutora Lucy, assistente virtual de tutoria socrática em apoio ao docente. Como posso apoiar sua jornada de aprendizado ou reflexão pedagógica agora?',
    citation: '[Ementa Oficial BD-I · Unidade II, pág. 42]',
    timestamp: '14:32',
  },
];

const SUGGESTIONS = [
  'Qual a diferença entre INNER e LEFT JOIN?',
  'Como a 3ª Forma Normal previne anomalias?',
  '💡 Pedir Dica Nível 1 (Conceitual)',
  '💡 Pedir Dica Nível 2 (Sintaxe)',
];

export function UniversalSocraticChat({
  agendaType,
  sessionId = 'session-live-01',
  onOpenMinutesModal,
  className,
  title = 'Tutora Lucy Virtual',
  subtitle = 'Apoio Socrático Multimodal · On-Premises',
}: UniversalSocraticChatProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);

  // Estados Multimodais
  const [isRecording, setIsRecording] = React.useState(false);
  const [mediaRecorder, setMediaRecorder] = React.useState<MediaRecorder | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<{
    type: 'audio' | 'image';
    file: File;
    previewUrl: string;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, selectedFile]);

  // Iniciar/Parar Gravação de Microfone em Tempo Real
  const toggleRecording = async () => {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
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
        const previewUrl = URL.createObjectURL(audioBlob);

        setSelectedFile({
          type: 'audio',
          file: audioFile,
          previewUrl,
        });

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  // Seleção manual de Arquivo (Áudio ou Imagem)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'image') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setSelectedFile({
      type,
      file,
      previewUrl,
    });
  };

  // Suporte a Colagem de Imagens via Clipboard (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const previewUrl = URL.createObjectURL(file);
          setSelectedFile({
            type: 'image',
            file,
            previewUrl,
          });
        }
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend || input;
    if (!messageContent.trim() && !selectedFile) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'student',
      text: messageContent || (selectedFile?.type === 'audio' ? '🎤 Gravação de Áudio' : '🖼️ Imagem Anexada'),
      attachment: selectedFile
        ? {
            type: selectedFile.type,
            url: selectedFile.previewUrl,
            name: selectedFile.file.name,
          }
        : undefined,
      timestamp: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setSelectedFile(null);
    setIsTyping(true);

    try {
      const res = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          agendaType,
          sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Falha na resposta do servidor.');
      }

      const teacherMsg: ChatMessage = {
        id: `teacher-${Date.now()}`,
        sender: 'teacher',
        text: data.reply,
        citation: data.citations?.[0],
        isGuardrailViolation: data.blockedByExamGuardrail,
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, teacherMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `teacher-err-${Date.now()}`,
        sender: 'teacher',
        text: 'Desculpe, ocorreu uma oscilação na conexão com o motor de inferência local. Por favor, tente novamente.',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-brand-orange ring-offset-2">
              <AvatarFallback className="bg-brand-teal text-white font-bold">
                TL
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                {title}
              </h4>
              <Badge variant="secondary" className="text-[10px] py-0 bg-brand-teal/10 text-brand-teal">
                Multimodal Socrático
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {onOpenMinutesModal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenMinutesModal}
            className="text-xs h-8 gap-1.5 border-brand-teal/40 text-brand-teal hover:bg-brand-teal/10 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ver Ata Pedagógica</span>
          </Button>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isTeacher = msg.sender === 'teacher';
          return (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3 max-w-[85%]',
                isTeacher ? 'mr-auto' : 'ml-auto flex-row-reverse'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isTeacher
                    ? 'bg-brand-teal text-white'
                    : 'bg-brand-orange text-white'
                )}
              >
                {isTeacher ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div className="space-y-1.5">
                <div
                  className={cn(
                    'rounded-2xl p-4 text-sm leading-relaxed shadow-soft-sm',
                    isTeacher
                      ? 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      : 'bg-brand-teal text-white'
                  )}
                >
                  {/* Attachment View */}
                  {msg.attachment && (
                    <div className="mb-3 p-2 rounded-lg bg-black/10 dark:bg-white/10 space-y-2">
                      {msg.attachment.type === 'image' && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={msg.attachment.url}
                          alt="Anexo de imagem"
                          className="max-h-48 rounded-md object-contain"
                        />
                      )}
                      {msg.attachment.type === 'audio' && (
                        <audio controls src={msg.attachment.url} className="w-full h-8" />
                      )}
                    </div>
                  )}

                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* RAG Citation Chip */}
                  {msg.citation && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-xs text-brand-teal dark:text-brand-teal-light font-medium">
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      <span>{msg.citation}</span>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'text-[10px] text-slate-400 px-1',
                    isTeacher ? 'text-left' : 'text-right'
                  )}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-slate-400 p-2 animate-pulse">
            <Bot className="h-4 w-4 text-brand-teal" />
            <span>Tutora Lucy está analisando os dados multimodais e formulando uma reflexão...</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-brand-orange" />
          Sugestões:
        </span>
        {SUGGESTIONS.map((sug) => (
          <button
            key={sug}
            onClick={() => handleSendMessage(sug)}
            className="text-xs shrink-0 rounded-lg px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-teal hover:text-brand-teal transition-colors cursor-pointer"
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Attachment Preview Box */}
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
            onClick={() => setSelectedFile(null)}
            className="p-1 hover:bg-amber-200/50 rounded-full transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5 text-amber-800 dark:text-amber-200" />
          </button>
        </div>
      )}

      {/* Input Form with Audio/Image Controls */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Audio Input Hidden */}
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'audio')}
          />

          {/* Image Input Hidden */}
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'image')}
          />

          {/* Botão de Anexo de Áudio */}
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

          {/* Botão de Anexo de Imagem (OCR/ERD) */}
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

          {/* Botão de Microfone (Gravação de Voz em Tempo Real) */}
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

          {/* Campo de Texto Principal com Suporte a Ctrl+V */}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={
              isRecording
                ? 'Gravando áudio... Clique no microfone para encerrar'
                : 'Digite sua dúvida, responda ou cole uma imagem (Ctrl+V)...'
            }
            className="flex-1 rounded-xl"
            disabled={isTyping}
          />

          {/* Botão Enviar */}
          <Button
            type="submit"
            disabled={(!input.trim() && !selectedFile) || isTyping}
            className="rounded-xl px-4 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
