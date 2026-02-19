---
'create-agentmark': patch
---

Fix builtInModels derived from templates instead of hardcoded adapter switch

- createExamplePrompts() now returns the model IDs it actually writes, making it the single source of truth for builtInModels
- Removes the hardcoded adapter→model switch that was missing openai/dall-e-3 and openai/tts-1-hd for ai-sdk users
- ai-sdk users now get all three models (gpt-4o, dall-e-3, tts-1-hd) in builtInModels on init
