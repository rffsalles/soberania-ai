-- Chunks de DOCX/TXT/MD indexados com os rótulos antigos passam a "Trecho N", para que as citações
-- deixem de mostrar "pág. N" inventada (reversível: o número original continua em "pageNumber").
UPDATE "material_chunks"
SET "chapter" = 'Trecho ' || "pageNumber"
WHERE "chapter" ~ '^(Seção [0-9]+|Texto|Notas / Documentação)$';
