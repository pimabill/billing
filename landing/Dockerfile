FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_DASHBOARD_URL=http://localhost:4002
ARG NEXT_PUBLIC_DOCS_URL=http://localhost:4003
ARG NEXT_PUBLIC_API_REF_URL=http://localhost:4000/api/reference
# Canonical address and contact for SEO; empty keeps the defaults in src/lib/site.ts.
ARG NEXT_PUBLIC_SITE_URL=
ARG NEXT_PUBLIC_CONTACT_EMAIL=
# "true" keeps search engines out, for a second copy of the site on another domain.
ARG NEXT_PUBLIC_NOINDEX=
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_API_REF_URL=$NEXT_PUBLIC_API_REF_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_NOINDEX=$NEXT_PUBLIC_NOINDEX
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 4001
ENV PORT=4001
CMD ["node", "server.js"]
