// MetallicPaint traces alpha; key the white backdrop of the existing monogram
// in memory so its original letter shapes are preserved. Source stays untouched.
const prepared = new Map();
export function prepareMonogram(src) {
  if (prepared.has(src)) return prepared.get(src);
  const task = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 640;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 640, 640);
        const data = ctx.getImageData(0, 0, 640, 640);
        for (let i = 0; i < data.data.length; i += 4) {
          const light =
            0.2126 * data.data[i] +
            0.7152 * data.data[i + 1] +
            0.0722 * data.data[i + 2];
          const coverage = Math.max(0, Math.min(1, (245 - light) / 245));
          data.data[i + 3] = Math.round(data.data[i + 3] * coverage);
          data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(new Error("Unable to prepare the loading monogram."));
    image.src = src;
  });
  prepared.set(src, task);
  return task;
}
