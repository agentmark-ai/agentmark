# AgentMark Frontend

This is the frontend web application for AgentMark, featuring a modern login/signup page with testimonial and branding.

## Features

- Modern, responsive login/signup page
- AgentMark logo and branding
- Customer testimonial with profile information
- Toggle between login and signup modes
- Beautiful gradient background with Tailwind CSS
- TypeScript support

## Layout

The login/signup page is split into two sections:

### Left Side (Branding and Testimonial)
1. **AgentMark Logo** - Positioned at the top
2. **Description** - Welcome message and product description
3. **Testimonial Quote** - Customer testimonial in italics
4. **Profile Information** - Round placeholder image with name, role, and location:
   - Dominic Vinyard
   - AI Designer
   - San Francisco, CA

### Right Side (Authentication Form)
- Toggle between "Sign In" and "Sign Up" modes
- Dynamic form fields based on mode
- Modern form styling with focus states
- Remember me checkbox (login mode)
- Forgot password link (login mode)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

2. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## Technologies Used

- React 18
- TypeScript
- Tailwind CSS
- Modern CSS Grid and Flexbox layouts

## Customization

The component accepts an `isLogin` prop to set the initial mode:

```tsx
<LoginSignupPage isLogin={true} />  // Start in login mode
<LoginSignupPage isLogin={false} /> // Start in signup mode
```