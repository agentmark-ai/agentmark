export const generateUnique8CharString = () => {
  const timestamp = Date.now().toString(36); // Convert timestamp to base36 string
  const randomChars = Math.random().toString(36).substr(2, 6); // Generate random base36 string
  return timestamp + randomChars;
};
