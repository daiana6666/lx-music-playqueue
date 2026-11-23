import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { cancelLoginQr, checkLoginQr, createLoginQr } from '@/core/netease'
import { setNeteaseAccountStatus } from '@/store/netease/action'
import { createLoginQrRenderSpec, shouldContinueLoginQrPolling } from '@/core/netease/helpers'

interface Props {
  visible: boolean
  onClose: () => void
}

const qrSize = 220
const qrDarkColor = '#315CFF'
const qrLightColor = '#EFF3FF'

const getErrorMessage = (err: unknown) => {
  return err instanceof Error ? err.message : String(err)
}

export const QrCodeMatrix = memo(({ value }: { value: string }) => {
  const spec = useMemo(() => {
    try {
      return createLoginQrRenderSpec(value, { maxSize: qrSize, margin: 4 })
    } catch {
      return { modules: [], renderSize: 0, cellSize: 0 }
    }
  }, [value])

  if (!spec.modules.length) return <View style={styles.qrPlaceholder} />

  return (
    <View style={styles.qrMatrix}>
      <View style={{ width: spec.renderSize, height: spec.renderSize }}>
        {spec.modules.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.qrRow}>
            {row.map((dark, colIndex) => (
              <View
                key={`${rowIndex}-${colIndex}`}
                style={{
                  ...styles.qrCell,
                  width: spec.cellSize,
                  height: spec.cellSize,
                  backgroundColor: dark ? qrDarkColor : qrLightColor,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
})

export default memo(({ visible, onClose }: Props) => {
  const theme = useTheme()
  const t = useI18n()
  const timerRef = useRef<number | null>(null)
  const [qr, setQr] = useState<LX.Netease.LoginQr | null>(null)
  const [message, setMessage] = useState('')
  const [qrImageError, setQrImageError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (visible) return
    setQr(null)
    setMessage('')
    setQrImageError(false)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let canceled = false

    const clearTimer = () => {
      if (timerRef.current == null) return
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const schedulePoll = (key: string) => {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void checkLoginQr(key).then(result => {
          if (canceled) return
          setMessage(result.message ?? t('netease_qr_waiting'))
          if (result.code == 803) {
            setNeteaseAccountStatus({
              isLoggedIn: result.isLoggedIn,
              profile: result.profile,
            })
            closeRef.current()
            return
          }
          if (shouldContinueLoginQrPolling(result.code)) schedulePoll(key)
        }).catch((err: Error) => {
          if (canceled) return
          setMessage(getErrorMessage(err))
          schedulePoll(key)
        })
      }, 2000) as unknown as number
    }

    const start = async() => {
      clearTimer()
      setQr(null)
      setQrImageError(false)
      setMessage(t('netease_qr_loading'))
      const nextQr = await createLoginQr()
      if (canceled) return
      setQr(nextQr)
      setMessage(t('netease_qr_waiting'))
      schedulePoll(nextQr.key)
    }

    void start().catch((err: Error) => {
      if (!canceled) setMessage(getErrorMessage(err))
    })

    return () => {
      canceled = true
      clearTimer()
      cancelLoginQr()
    }
  }, [t, visible, refreshKey])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView behavior={Platform.OS == 'ios' ? 'padding' : undefined} style={{ ...styles.panel, backgroundColor: theme['c-content-background'] }}>
              <Text size={16} style={styles.title}>{t('netease_login')}</Text>
              <View style={styles.qrBox}>
                {qr?.qrimg && !qrImageError
                  ? <Image url={qr.qrimg} cache={false} style={styles.qr} resizeMode="contain" onError={() => { setQrImageError(true) }} />
                  : <QrCodeMatrix value={qr?.qrurl ?? ''} />}
              </View>

              <Text size={12} color={theme['c-font-label']} style={styles.message}>{message}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setRefreshKey(value => value + 1) }}>
                <Text size={13}>刷新二维码</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ ...styles.closeBtn, borderColor: theme['c-border-background'] }} onPress={onClose}>
                <Text size={13}>{t('close')}</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
})

const styles = createStyle({
  mask: {
    flex: 1,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  panel: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
  },
  qrBox: {
    width: qrSize,
    height: qrSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: qrSize,
    height: qrSize,
    borderRadius: 6,
  },
  qrPlaceholder: {
    width: qrSize,
    height: qrSize,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  qrMatrix: {
    width: qrSize,
    height: qrSize,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  qrRow: {
    flexDirection: 'row',
  },
  qrCell: {
    flexGrow: 0,
    flexShrink: 0,
  },
  message: {
    marginTop: 12,
    minHeight: 18,
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: 12,
    minWidth: 96,
    height: 34,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
