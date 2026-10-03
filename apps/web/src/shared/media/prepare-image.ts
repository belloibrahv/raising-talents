/** The longest side the API keeps (design section 6.4). Sending more only wastes data. */
export const MAX_IMAGE_SIDE = 2048;

/**
 * Shrinks a photo to 2048 px and re-encodes it as JPEG before upload. That saves data on
 * slow connections, and re-encoding drops the file's metadata (including GPS position)
 * before it leaves the phone. The server strips metadata again; this is a second line.
 * Anything the browser cannot decode (HEIC outside Safari) is sent as it is.
 */
export async function prepareImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
