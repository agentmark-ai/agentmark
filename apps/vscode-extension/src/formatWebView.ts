import type { GeneratedFile, GeneratedAudioFile } from "ai";

export const imageHtmlFormat = (images: GeneratedFile[]) => {
  if (!images.length) {
    return noGeneratedFileHtml("No Generated Images");
  }

  const imageListHtml = imagesHtml(images);
  return `
  <html>
    <body style="margin:0;padding:20px;font-family:sans-serif;">
      <h1>Generated Images</h1>
      ${imageListHtml}
    </body>
  </html>
`;
};

const imagesHtml = (images: GeneratedFile[]): string => {
  return images
    .map(
      (image, index) => `
    <div class="image-container" style="margin-bottom: 20px;">
      <p>Image ${index + 1}</p>
      <img src="data:${image.mimeType};base64,${image.base64}" 
      alt="Image" style="max-width:100%;height:auto;" />
      <br />
    </div>
    `
    )
    .join("");
};

const noGeneratedFileHtml = (errorMessage: string): string =>
  `
  <html>
    <body style="margin:0;padding:20px;font-family:sans-serif;">
      <h1>${errorMessage}</h1>
    </body>
  </html>
`;

export const audioHtmlFormat = (audios: GeneratedAudioFile): string => {
  if (!audios) {
    return noGeneratedFileHtml("No Generated Audio File");
  }

  return `
    <html>
      <body style="margin:0;padding:20px;font-family:sans-serif;">
        <h1>Generated Audio</h1>
          <div class="audio-container" style="margin-bottom: 20px;">
            <p>Audio File</p>
            <audio controls style="width: 100%;">
              <source src="data:${audios.mimeType};base64,${audios.base64}" type="${audios.mimeType}">
              Your browser does not support the audio element.
            </audio>
          </div>
      </body>
    </html>
  `;
};
