import { z } from 'zod';
import { STUDY_GROUP_MAX_MESSAGE_LENGTH } from '@/lib/constants/tutor';

export const postStudyGroupMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'A mensagem não pode ser vazia.')
    .max(STUDY_GROUP_MAX_MESSAGE_LENGTH, `A mensagem deve ter no máximo ${STUDY_GROUP_MAX_MESSAGE_LENGTH} caracteres.`),
});
