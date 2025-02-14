import sharp from "sharp";

export async function resizeImage(data: Uint8Array | undefined) {
  if (data === undefined) return data;
  try {
    // Use sharp to resize the image
    const resizedImageBuffer = await sharp(data)
      .resize(512, 512, {
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .toBuffer();

    return new Uint8Array(resizedImageBuffer);
  } catch (error) {
    console.error("Error resizing image:", error);
  }
}
