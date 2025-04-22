export const getTsConfigContent = (): object => {
  return {
    "compilerOptions": {
      "target": "ES2020",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "esModuleInterop": true,
      "forceConsistentCasingInFileNames": true,
      "strict": true,
      "skipLibCheck": true
    }
  };
}; 