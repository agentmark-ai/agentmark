import type { Preview } from '@storybook/react-vite'
import { SyntaxHighlighter } from '@storybook/components';
// @ts-ignore
(async () => {
  // @ts-ignore
  const { default: scss } = await import("../../../node_modules/refractor/lang/scss");
  SyntaxHighlighter.registerLanguage("scss", scss);
})();

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;