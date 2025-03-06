interface ImportMetaEnv {
  VITE_OPENAI_API_KEY: string
  VITE_ELEVEN_LABS_KEY: string
  VITE_STT_API_KEY: string
  VITE_AWS_ACCESS_KEY_ID: string
  VITE_AWS_SECRET_ACCESS_KEY: string
  VITE_CLERK_FRONTEND_API: string
  VITE_CLERK_PUBLISHABLE_KEY: string
  VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 