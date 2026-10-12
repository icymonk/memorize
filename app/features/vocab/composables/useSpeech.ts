import type { Lang } from '#shared/schemas/deck'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** VOC-14 발음 듣기: 기기 음성(Web Speech API), 언어별 목소리는 이 기기에 저장 */
const BCP47: Record<Lang, string> = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', vi: 'vi-VN', other: '' }
const KEY = 'memorize.voice.'

export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const voices = ref<SpeechSynthesisVoice[]>([])
  const chosen = ref<Partial<Record<Lang, string>>>({})

  const load = () => { voices.value = window.speechSynthesis.getVoices() }
  onMounted(() => {
    if (!supported) return
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    for (const lang of Object.keys(BCP47) as Lang[]) {
      const name = localStorage.getItem(KEY + lang)
      if (name) chosen.value[lang] = name
    }
  })
  onBeforeUnmount(() => {
    if (supported) window.speechSynthesis.removeEventListener('voiceschanged', load)
  })

  function voicesFor(lang: Lang) {
    const prefix = BCP47[lang].slice(0, 2)
    return voices.value.filter(v => !prefix || v.lang.toLowerCase().startsWith(prefix))
  }

  function setVoice(lang: Lang, name: string) {
    chosen.value[lang] = name
    if (name) localStorage.setItem(KEY + lang, name)
    else localStorage.removeItem(KEY + lang)
  }

  function speak(text: string, lang: Lang) {
    if (!supported || !text.trim()) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (BCP47[lang]) u.lang = BCP47[lang]
    const voice = voices.value.find(v => v.name === chosen.value[lang])
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
  }

  return { supported, voicesFor, chosen, setVoice, speak }
}
