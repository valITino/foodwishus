import { useT } from '../../i18n'
import { AwningHeader, EmptyState, Screen } from '../../ui/components'

/** Placeholder until milestone 5 brings the stats cockpit. */
export function CockpitScreen() {
  const t = useT()
  return (
    <Screen tabs>
      <AwningHeader title={t.tabs.cockpit} />
      <EmptyState title={t.cockpitSoon.title} body={t.cockpitSoon.body} mood="happy" />
    </Screen>
  )
}
