const EDITOR_IMAGE = 'session_editor_image'
const EDITOR_PROMPT = 'session_editor_prompt'
const RESULT_ORIGINAL = 'session_result_original'
const RESULT_OUTPUT = 'session_result_output'

export function setEditorImage(path: string) {
  wx.setStorageSync(EDITOR_IMAGE, path)
}

export function getEditorImage(): string {
  return wx.getStorageSync(EDITOR_IMAGE) || ''
}

export function setEditorPrompt(prompt: string) {
  wx.setStorageSync(EDITOR_PROMPT, prompt)
}

export function getEditorPrompt(): string {
  return wx.getStorageSync(EDITOR_PROMPT) || ''
}

export function setResultPaths(original: string, output: string) {
  wx.setStorageSync(RESULT_ORIGINAL, original)
  wx.setStorageSync(RESULT_OUTPUT, output)
}

export function getResultOriginal(): string {
  return wx.getStorageSync(RESULT_ORIGINAL) || ''
}

export function getResultOutput(): string {
  return wx.getStorageSync(RESULT_OUTPUT) || ''
}
