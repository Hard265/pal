# Issue: Fix Gemini API function response formatting error

## Description

There is an error in the Gemini API function where the response is returning an invalid JSON payload for the `function_response` parts. The current implementation is resulting in formatted responses that do not adhere to the expected structure.

### Error Message

`Invalid JSON payload received for function_response.`

### Root Cause Analysis

The `responseParts` array should be passed in the following format:
```json
{ parts: responseParts }
```
Instead of the current implementation, which incorrectly attempts to pass it as:
```json
{ message: responseParts }
```
This error is encountered on line **99** of `src/ai/client.ts`.

### Suggested Fix

Update line 99 in `src/ai/client.ts` to:
```typescript
return { parts: responseParts };
```
This change will ensure the API function correctly formats the response payload and resolves the invalid JSON error.