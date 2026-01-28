# Student Identity Extraction Fix

## Problem
Student identity (name and class) was often incorrect or became the generic fallback "Studente" after login, especially for accounts with multiple profiles. The root cause was that identity extraction relied on specific keys (alunno.desNome, alunno.desCognome, desClasse) that may be named differently in different Argo environments.

## Solution
Implemented robust multi-source identity extraction with intelligent fallbacks:

1. **Primary**: Extract from profile API using multiple key variants
2. **Fallback**: Extract from dashboard alunno block if profile data missing
3. **Safe Default**: Use "Studente" and "N/D" only as last resort

## Key Features

### Multiple Key Variant Support
- Handles both `desNome`/`desCognome` and `nome`/`cognome`
- Checks nested `alunno` object and direct profile fields
- Supports single-string name fields with validation

### Safety Mechanisms
- Subject/period token rejection (prevents "PRIMO QUADRIMESTRE" as name)
- Class validation with regex `^[1-5][A-Z]$`
- Never parses arbitrary dashboard strings
- Only reads from structured `alunno` blocks

### Normalization
- All names in `"COGNOME NOME"` uppercase format
- Consistent profile IDs: `{school.upper()}:{username.lower()}:{index}`
- Extra spaces removed

## Functions Added

### `extract_student_identity_from_profile(profile: dict)`
Primary extraction from profile API data. Tries multiple key variants and returns normalized name and validated class.

### `extract_student_identity_from_dashboard_alunno(dashboard_data: dict)`
Safe fallback extraction from dashboard data. Only reads from structured `data.dati[*].alunno` blocks.

## Testing
Comprehensive test suite created covering:
- Multiple key format variants
- Dashboard fallback scenarios
- Subject/professor name rejection
- Class validation
- Edge cases (lists, empty data, etc.)

All tests pass successfully.

## Security
- CodeQL scan: 0 vulnerabilities
- No arbitrary string parsing
- Input validation and sanitization

## Deployment
Ready for production. Changes are backward compatible with no breaking changes to API responses.
