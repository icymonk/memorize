import type { Tag } from '../services/tags'
import { watchTags } from '../services/tags'

/** CMN-51: 지금 공간의 공통 태그 (실시간) */
export function useTags() {
  const space = useSpaceStore()
  const { $firestore } = useNuxtApp()
  const tags = ref<Tag[]>([])
  let stop: (() => void) | undefined
  watch(() => space.current?.id, (sid) => {
    stop?.()
    tags.value = []
    if (sid) stop = watchTags($firestore, sid, (l) => { tags.value = l })
  }, { immediate: true })
  onUnmounted(() => stop?.())
  return tags
}
