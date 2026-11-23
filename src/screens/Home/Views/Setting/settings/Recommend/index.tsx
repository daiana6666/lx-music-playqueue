import { memo } from 'react'
import Section from '../../components/Section'
import { useI18n } from '@/lang'
import SectionOrder from './SectionOrder'
import DailySongTags from './DailySongTags'

export default memo(() => {
  const t = useI18n()
  return (
    <Section title={t('setting_recommend')}>
      <SectionOrder />
      <DailySongTags />
    </Section>
  )
})
