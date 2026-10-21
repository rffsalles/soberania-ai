'use client';

import * as React from 'react';
import { Upload, Video } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LESSON_MEDIA_ACCEPT, LESSON_MEDIA_TYPE, MEDIA_MAX_UPLOAD_MB, type LessonMediaType } from '@/lib/constants/teaching';
import { uploadLessonMedia, type LessonItem } from '@/components/teaching/use-lessons';

const UPLOAD_TAB = 'upload';
const YOUTUBE_TAB = 'youtube';
const BYTES_PER_MB = 1024 * 1024;

type Props = {
  lessonId: string;
  mediaType: LessonMediaType | null;
  mediaUrl: string | null;
  onYoutubeChange: (url: string) => void;
  onUploaded: (lesson: LessonItem) => void;
};

export function MediaTabs({ lessonId, mediaType, mediaUrl, onYoutubeChange, onUploaded }: Props) {
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const isUpload = mediaType === LESSON_MEDIA_TYPE.S3_UPLOAD;
  const youtubeUrl = mediaType === LESSON_MEDIA_TYPE.YOUTUBE ? (mediaUrl ?? '') : '';

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MEDIA_MAX_UPLOAD_MB * BYTES_PER_MB) {
      setError(`O arquivo excede o limite de ${MEDIA_MAX_UPLOAD_MB} MB.`);
      input.value = '';
      return;
    }
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      onUploaded(await uploadLessonMedia(lessonId, file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  return (
    <Tabs defaultValue={isUpload ? UPLOAD_TAB : YOUTUBE_TAB}>
      <TabsList>
        <TabsTrigger value={YOUTUBE_TAB} className="gap-2">
          <Video className="h-4 w-4" /> YouTube
        </TabsTrigger>
        <TabsTrigger value={UPLOAD_TAB} className="gap-2">
          <Upload className="h-4 w-4" /> Upload
        </TabsTrigger>
      </TabsList>

      <TabsContent value={YOUTUBE_TAB} className="space-y-2">
        <label htmlFor="youtube-url" className="text-xs font-semibold">
          URL do vídeo
        </label>
        <Input
          id="youtube-url"
          value={youtubeUrl}
          onChange={(e) => onYoutubeChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="rounded-xl text-sm"
        />
        <p className="text-xs text-slate-500">Salve a aula para aplicar o vídeo.</p>
      </TabsContent>

      <TabsContent value={UPLOAD_TAB} className="space-y-2">
        <label htmlFor="media-file" className="text-xs font-semibold">
          Arquivo (mp4, webm, mp3, m4a ou pdf — até {MEDIA_MAX_UPLOAD_MB} MB)
        </label>
        <input
          id="media-file"
          type="file"
          accept={LESSON_MEDIA_ACCEPT}
          disabled={uploading}
          onChange={handleFile}
          className="block w-full text-sm"
        />
        {uploading && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p role="status" className="text-xs text-slate-500">
              Enviando... {progress}%
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {isUpload && mediaUrl && !uploading && (
          <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-teal underline">
            Mídia enviada — abrir arquivo atual
          </a>
        )}
      </TabsContent>
    </Tabs>
  );
}
