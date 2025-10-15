export const getStoryTellerPrompt = (): string => {
  return `---
name: story-teller
speech_config:
  model_name: tts-1-hd
  voice: "nova"
  speed: 1.0
  output_format: "mp3"
test_settings:
  dataset: ./story.jsonl
  props:
    story: "Once upon a time, there was a cat who loved to play with a ball."
---

<System>
You are a storyteller for children. Make sure your story is engaging and interesting.
</System>

<SpeechPrompt>
- {props.story}
</SpeechPrompt>`;
};