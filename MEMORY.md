# Project Blueprint: InputBridge Extension

## Identity & Goals
<!-- What is this project? What problem does it solve? Who is it for? -->


## MVP Scope
<!-- Core features that must be delivered in the first working version -->


## Technical Stack
- **Frontend:**
- **Backend:**
- **Database:**
- **UI Framework:**
- **API Style:**


## Folder & File Structure
```
src/
  components/   # Reusable UI components
  pages/        # Route-level pages
  services/     # Business logic & API calls
  utils/        # Pure helper functions
```


## Naming Conventions
- Components: PascalCase (e.g. UserCard.tsx)
- Files & folders: kebab-case (e.g. user-card/)
- Hooks: camelCase prefixed with "use" (e.g. useAuth)


## Required Environment Variables
```env
# Add all required env keys below — agent will warn if any are missing
```


## Agent Rules & Guardrails
<!-- Strict instructions the AI must follow for this project -->
- Do not hardcode colors or spacing — always use design tokens
- Never modify .env files without explicit user approval
- Ask before installing new packages
