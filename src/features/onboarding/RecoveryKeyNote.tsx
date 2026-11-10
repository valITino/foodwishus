// The recovery key, shown once: a taped-up note with the key in readable groups, a copy
// button, and a switch to confirm it is written down before anything else happens.

import { useCopy, useT } from '../../i18n'
import { Button, buzz, Card, toast, Toggle } from '../../ui/components'
import { WashiTape } from '../../ui/deco/Deco'
import { groupCode } from './codes'
import { pairingCopy } from './copy'
import { copyText } from './parts'

interface Props {
  recoveryKey: string
  confirmed: boolean
  onConfirm: (confirmed: boolean) => void
}

export function RecoveryKeyNote({ recoveryKey, confirmed, onConfirm }: Props) {
  const c = useCopy(pairingCopy)
  const t = useT()
  const grouped = groupCode(recoveryKey)
  const groups = grouped.split('-')

  const copy = async () => {
    const ok = await copyText(grouped)
    if (ok) buzz(10)
    toast(ok ? t.common.copied : t.common.somethingWrong, ok ? 'ok' : 'oops')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative pt-3">
        <WashiTape tone="butter" size={92} className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -rotate-2" />
        <Card tone="note" pad={false} className="px-5 pb-6 pt-8 text-center">
          <p className="text-2xs font-extrabold">{c.keyCard.keyLabel}</p>
          <p
            data-testid="recovery-key"
            aria-label={recoveryKey.split('').join(' ')}
            className="tabular mt-2 flex select-all flex-col items-center gap-1 text-[1.55rem] font-extrabold leading-tight tracking-[0.08em]"
          >
            <span>
              {groups[0]}-{groups[1]}
            </span>
            <span className="sr-only">-</span>
            <span>
              {groups[2]}-{groups[3]}
            </span>
          </p>
        </Card>
      </div>
      <Button variant="secondary" onClick={() => void copy()} className="self-center">
        {c.keyCard.copy}
      </Button>
      <Card pad={false} className="px-4 py-1">
        <Toggle label={c.keyCard.confirm} checked={confirmed} onChange={onConfirm} />
      </Card>
    </div>
  )
}
