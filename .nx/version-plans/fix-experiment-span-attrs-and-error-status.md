---
'agentmark-prompt-core': patch
'@agentmark-ai/prompt-core': patch
---

Fix experiment item spans missing model/classify/usage attributes in both Python and TypeScript runners. Fixes Requests view showing "No Requests", Model=-, and Tokens=0 in the experiment view. Also fixes Python executor ErrorEvents exiting the span cleanly (status OK) instead of propagating as exceptions (status ERROR).
