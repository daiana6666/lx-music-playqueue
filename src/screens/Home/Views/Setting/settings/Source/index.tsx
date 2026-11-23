import { memo } from 'react'

import Section from '../../components/Section'
import Source from '../Basic/Source'
import SourceName from '../Basic/SourceName'
import { useI18n } from '@/lang/i18n'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_basic_source')}>
      <Source />
      <SourceName />
    </Section>
  )
})
