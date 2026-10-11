import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
	base:
		command === "build"
			? (process.env.VITE_BASE_PATH ??
				(process.env.VERCEL ? "/" : "/trunk-slosh/"))
			: "/",
	server: {
		host: "0.0.0.0",
		port: 49217,
		strictPort: true,
	},
}));
