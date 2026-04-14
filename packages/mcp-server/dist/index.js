#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiCall, getApiKey } from "./api.js";
const server = new McpServer({
    name: "huozi",
    version: "0.3.0",
});
// --- Auth tools ---
server.tool("huozi_signup", "Sign in or register a Huozi account. Sends a verification code to the email. No password needed.", {
    email: z.string().email().describe("User email address"),
}, async ({ email }) => {
    const res = await apiCall("/api/v1/auth/signup", {
        method: "POST",
        body: { email },
    });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Signup failed: ${res.data.error || "Unknown error"}`,
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: `Verification code sent to ${email}. Ask the user to check their email and provide the code, then call huozi_verify.`,
            },
        ],
    };
});
server.tool("huozi_verify", "Verify email with the code received. Returns an access_token for setup.", {
    email: z.string().email().describe("Email used during signup"),
    code: z.string().min(6).max(8).describe("Verification code from email"),
}, async ({ email, code }) => {
    const res = await apiCall("/api/v1/auth/verify", {
        method: "POST",
        body: { email, code },
    });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Verification failed: ${res.data.error || "Invalid code"}`,
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: `Email verified! Access token: ${res.data.access_token}\n\nNow call huozi_setup with this token and a workspace slug to complete setup.`,
            },
        ],
    };
});
server.tool("huozi_setup", "Create a workspace and generate an API key. Requires the access_token from huozi_verify.", {
    access_token: z.string().describe("Access token from huozi_verify"),
    workspace_slug: z
        .string()
        .regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/)
        .describe("Workspace slug (lowercase, hyphens, 1-40 chars). This becomes huozi.app/<slug>"),
}, async ({ access_token, workspace_slug }) => {
    const res = await apiCall("/api/v1/auth/setup", {
        method: "POST",
        body: { workspace_slug },
        token: access_token,
    });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Setup failed: ${res.data.error || "Unknown error"}`,
                },
            ],
        };
    }
    const workspace = res.data.workspace;
    return {
        content: [
            {
                type: "text",
                text: `Setup complete!\n\nWorkspace: ${workspace.url}\nAPI Key: ${res.data.api_key}\n\nTell the user to set HUOZI_API_KEY=${res.data.api_key} in their environment. They can now publish pages with huozi_publish.`,
            },
        ],
    };
});
// --- Page tools ---
server.tool("huozi_publish", "Publish or update a page on Huozi. Supports Markdown (default) and HTML. If a page with the same slug exists, it will be updated. HTML pages support full CSS styling, SVG, and images but no JavaScript — all <script> tags and event handlers are stripped.", {
    title: z.string().min(1).describe("Page title"),
    content: z.string().min(1).describe("Page content — Markdown or HTML"),
    slug: z
        .string()
        .optional()
        .describe("URL slug (optional, auto-generated from title if omitted)"),
    description: z
        .string()
        .optional()
        .describe("SEO description (optional)"),
    content_type: z
        .enum(["markdown", "html"])
        .optional()
        .describe("Content type: 'markdown' (default) or 'html'. HTML accepts full documents or body fragments. CSS is preserved, JS is stripped."),
}, async ({ title, content, slug, description, content_type }) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            content: [
                {
                    type: "text",
                    text: "HUOZI_API_KEY is not set. Please run huozi_signup → huozi_verify → huozi_setup first, or set the environment variable.",
                },
            ],
        };
    }
    const body = { title, content };
    if (slug)
        body.slug = slug;
    if (description)
        body.description = description;
    if (content_type)
        body.content_type = content_type;
    const res = await apiCall("/api/v1/pages", {
        method: "POST",
        body,
        apiKey,
    });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Publish failed: ${res.data.error || "Unknown error"}`,
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: `Published! URL: ${res.data.url}`,
            },
        ],
    };
});
server.tool("huozi_list", "List all pages in the workspace.", {}, async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            content: [
                {
                    type: "text",
                    text: "HUOZI_API_KEY is not set.",
                },
            ],
        };
    }
    const res = await apiCall("/api/v1/pages", { apiKey });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to list pages: ${res.data.error || "Unknown error"}`,
                },
            ],
        };
    }
    const pages = res.data.pages;
    if (!pages || pages.length === 0) {
        return {
            content: [{ type: "text", text: "No pages yet." }],
        };
    }
    const list = pages
        .map((p) => `- ${p.title} (/${p.slug}) ${p.is_published ? "✓" : "[draft]"} — ${p.updated_at}`)
        .join("\n");
    return {
        content: [{ type: "text", text: list }],
    };
});
server.tool("huozi_get", "Get details and content of a specific page.", {
    slug: z.string().describe("Page slug"),
}, async ({ slug }) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            content: [
                { type: "text", text: "HUOZI_API_KEY is not set." },
            ],
        };
    }
    const res = await apiCall(`/api/v1/pages/${slug}`, { apiKey });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Page not found: ${res.data.error || slug}`,
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: `Title: ${res.data.title}\nSlug: ${res.data.slug}\nPublished: ${res.data.is_published}\nUpdated: ${res.data.updated_at}\n\n---\n\n${res.data.content}`,
            },
        ],
    };
});
server.tool("huozi_delete", "Delete a page.", {
    slug: z.string().describe("Page slug to delete"),
}, async ({ slug }) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            content: [
                { type: "text", text: "HUOZI_API_KEY is not set." },
            ],
        };
    }
    const res = await apiCall(`/api/v1/pages/${slug}`, {
        method: "DELETE",
        apiKey,
    });
    if (!res.ok) {
        return {
            content: [
                {
                    type: "text",
                    text: `Delete failed: ${res.data.error || "Unknown error"}`,
                },
            ],
        };
    }
    return {
        content: [
            { type: "text", text: `Deleted page: ${slug}` },
        ],
    };
});
// --- Start server ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
