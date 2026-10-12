<script setup lang="ts">
import type { CollectionScope, PropType } from '#shared/schemas/collection'
import type { Collection } from '../services/collections'
import { collectionInput, MAX_PROPS, newPropKey, PROP_TYPES } from '#shared/schemas/collection'
import { PlusIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { createCollection, updateCollection } from '../services/collections'

/** NOTE-46·49: 모음 만들기·설정 (이름, 아이콘, 항목, 내 모음/공유 모음) */
const props = defineProps<{ collection?: Collection | null }>()
const emit = defineEmits<{ saved: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.notes.collections
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

interface Row { key: string, name: string, type: PropType, options: string }
const name = ref('')
const icon = ref('')
const scope = ref<CollectionScope>('shared')
const rows = ref<Row[]>([])
const pending = ref(false)
const personal = computed(() => space.current?.kind === 'personal')
const selectClass = 'border-input bg-background h-9 rounded-md border px-2 text-sm'
const hasOptions = (type: PropType) => type === 'select' || type === 'multiSelect'

watch(open, (v) => {
  if (!v) return
  const c = props.collection
  name.value = c?.name ?? ''
  icon.value = c?.icon ?? ''
  scope.value = c?.scope ?? (personal.value ? 'private' : 'shared')
  rows.value = (c?.schema ?? []).map(p => ({ key: p.key, name: p.name, type: p.type, options: (p.options ?? []).join(', ') }))
})

function addRow() {
  rows.value.push({ key: newPropKey(rows.value.map(r => r.key)), name: '', type: 'text', options: '' })
}

async function submit() {
  const schema = rows.value.filter(r => r.name.trim()).map(r => ({
    key: r.key,
    name: r.name,
    type: r.type,
    options: hasOptions(r.type) ? [...new Set(r.options.split(',').map(s => s.trim()).filter(Boolean))] : [],
  }))
  const parsed = collectionInput.safeParse({ name: name.value, icon: icon.value.trim(), scope: personal.value ? 'private' : scope.value, schema })
  if (!parsed.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  pending.value = true
  try {
    const sid = space.current!.id
    let id: string
    if (props.collection) {
      const { name, icon, schema } = parsed.data
      await updateCollection($firestore, sid, props.collection.id, { name, icon, schema })
      id = props.collection.id
      toast.success(t.saved)
    }
    else {
      id = await createCollection($firestore, sid, auth.user!.uid, parsed.data)
      toast.success(t.created(parsed.data.name))
    }
    open.value = false
    emit('saved', id)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ collection ? t.settings : t.create }}</DialogTitle>
        <DialogDescription v-if="!collection">
          {{ t.createDescription }}
        </DialogDescription>
      </DialogHeader>

      <form id="collection-form" class="flex flex-col gap-5" @submit.prevent="submit">
        <div class="flex gap-3">
          <div class="flex w-20 flex-col gap-2">
            <Label for="col-icon">{{ t.icon }}</Label>
            <Input id="col-icon" v-model="icon" maxlength="16" placeholder="📒" class="text-center" />
          </div>
          <div class="flex flex-1 flex-col gap-2">
            <Label for="col-name">{{ t.name }}</Label>
            <Input id="col-name" v-model="name" required maxlength="60" :placeholder="t.namePlaceholder" />
          </div>
        </div>

        <div v-if="!collection" class="flex flex-col gap-2">
          <Label>{{ t.scope }}</Label>
          <p v-if="personal" class="text-muted-foreground text-sm">
            {{ t.personalOnly }}
          </p>
          <template v-else>
            <RadioGroup v-model="scope" class="flex flex-col gap-2">
              <label v-for="s in ['shared', 'private']" :key="s" class="flex items-center gap-2 text-sm">
                <RadioGroupItem :value="s" />
                {{ t.scopes[s] }}
              </label>
            </RadioGroup>
            <p class="text-muted-foreground text-xs">
              {{ t.scopeHint }}
            </p>
          </template>
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ t.props }}</Label>
          <p class="text-muted-foreground text-xs">
            {{ t.propsHint }}
          </p>
          <div v-for="(r, i) in rows" :key="r.key" class="flex flex-col gap-2 rounded-md border p-2">
            <div class="flex gap-2">
              <Input v-model="r.name" maxlength="40" :placeholder="t.propName" :aria-label="t.propName" class="flex-1" />
              <select v-model="r.type" :class="selectClass" :aria-label="t.props">
                <option v-for="type in PROP_TYPES" :key="type" :value="type">
                  {{ t.propTypes[type] }}
                </option>
              </select>
              <Button type="button" variant="ghost" size="icon" :aria-label="t.removeProp" @click="rows.splice(i, 1)">
                <XIcon />
              </Button>
            </div>
            <Input v-if="hasOptions(r.type)" v-model="r.options" maxlength="900" :placeholder="t.options" :aria-label="t.options" />
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" :disabled="rows.length >= MAX_PROPS" @click="addRow">
            <PlusIcon />
            {{ t.addProp }}
          </Button>
        </div>
      </form>

      <DialogFooter>
        <Button type="submit" form="collection-form" :disabled="pending || !name.trim()">
          {{ collection ? t.save : t.create }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
