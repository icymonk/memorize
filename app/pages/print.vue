<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import BlockEditor from '~/features/notes/components/BlockEditor.vue'
import { parsePrintItems } from '~/features/notes/services/exportPages'
import { getPage } from '~/features/notes/services/pages'
import { ko } from '~/locales/ko'

/** NOTE-70·71 PDF: 페이지(여럿이면 한 장씩 나눠)를 인쇄용으로 보여 주고 인쇄 창을 연다. "PDF로 저장"을 고르면 PDF가 된다 */
definePageMeta({ layout: false })
const t = ko.notes.export
const route = useRoute()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const pages = ref<(Page & { sid: string })[]>([])
const loading = ref(true)
useHead({ title: computed(() => (pages.value.length === 1 ? pages.value[0]!.title || ko.notes.untitled : t.bundleTitle)) })
const print = () => window.print()
const dateOf = (p: Page) => (typeof p.props?.date === 'string' ? p.props.date : '')

onMounted(async () => {
  try {
    await auth.ensureAccount()
    const got = await Promise.all(parsePrintItems(route.query.items).map(async r => {
      const p = await getPage($firestore, r.sid, r.id).catch(() => null)
      return p && !p.deletedAt ? { ...p, sid: r.sid } : null
    }))
    pages.value = got.filter(p => p !== null)
  }
  finally { loading.value = false }
  if (pages.value.length) setTimeout(() => window.print(), 1500)
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6 print:max-w-none print:p-0">
    <div class="flex flex-wrap items-center gap-2 print:hidden">
      <Button size="sm" :disabled="!pages.length" @click="print">
        {{ t.print }}
      </Button>
      <span class="text-muted-foreground text-xs">{{ t.printHint }}</span>
    </div>
    <p v-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <p v-else-if="!pages.length" class="text-muted-foreground text-sm">
      {{ t.notFound }}
    </p>
    <article v-for="(p, i) in pages" :key="`${p.sid}/${p.id}`" :class="i > 0 && 'break-before-page'" data-testid="print-page">
      <p v-if="dateOf(p)" class="text-muted-foreground text-sm">
        {{ dateOf(p) }}
      </p>
      <h1 class="mb-4 text-3xl font-bold">
        {{ p.icon }} {{ p.title || ko.notes.untitled }}
      </h1>
      <BlockEditor :space-id="p.sid" :page-id="p.id" :editable="false" />
    </article>
  </div>
</template>
