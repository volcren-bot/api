declare global {
	namespace NodeJS {
		interface ProcessEnv {
			[key: string]: string | undefined
			SUPABASE_URL: string
			SUPABASE_ANON_KEY: string
			SUPABASE_SERVICE_KEY: string
			/** Interface to listen on. Defaults to 0.0.0.0. */
			HOST: string | undefined
			PORT: string | undefined
			NODE_ENV: "development" | "production" | "debug"
		}
	}
}

export {}
