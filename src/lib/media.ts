import { saveEntity } from './api';

export async function uploadImage(file: File, context = 'editor/images') {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Выберите PNG, JPEG или WebP.');
  if (file.size > 12 * 1024 * 1024)
    throw new Error('Исходное изображение должно быть меньше 12 МБ.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext('2d')!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/webp', 0.88);
    if (dataUrl.length > 900000) dataUrl = canvas.toDataURL('image/webp', 0.65);
    if (dataUrl.length > 900000)
      throw new Error(
        'Изображение слишком большое после сжатия. Выберите меньший размер.',
      );
    const result = await saveEntity<{ url: string }>('/api/media/uploads', {
      dataUrl,
      context,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data.url;
  } finally {
    bitmap.close();
  }
}
