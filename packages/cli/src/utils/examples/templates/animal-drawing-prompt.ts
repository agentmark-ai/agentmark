export const getAnimalDrawingPrompt = (): string => {
  return `---
name: animal-drawing
image_config:
  model_name: dall-e-3
  num_images: 1
  size: 1024x1024
  aspect_ratio: 1:1
test_settings:
  dataset: ./animal.jsonl
  props:
    animal: "cat"
---

<ImagePrompt>
Draw a hyper-realistic picture of a {props.animal}
</ImagePrompt>`;
};