import { Platform } from 'react-native'
import { temporaryDirectoryPath, readDir, unlink, extname } from '@/utils/fs'

export interface MusicMetadata {
  albumName: string
  singer: string
  name: string
}

export interface MusicMetadataFull {
  type: 'mp3' | 'flac' | 'ogg' | 'wav'
  bitrate: string
  interval: number
  size: number
  ext: 'mp3' | 'flac' | 'ogg' | 'wav'
  albumName: string
  singer: string
  name: string
}

interface NativeLocalMediaMetadata {
  readMetadata(filePath: string): Promise<MusicMetadataFull | null>
  writeMetadata(filePath: string, metadata: MusicMetadata, isOverwrite: boolean): Promise<void>
  readPic(filePath: string, picDir: string): Promise<string>
  writePic(filePath: string, picPath: string): Promise<void>
  readLyric(filePath: string, isReadLrcFile: boolean): Promise<string>
  writeLyric(filePath: string, lyric: string): Promise<void>
}

// 该包同样只有 Android 原生实现，iOS 上调用会抛 LINKING_ERROR
const native: NativeLocalMediaMetadata | null = Platform.OS === 'ios'
  ? null
  : require('react-native-local-media-metadata')

let cleared = false
const picCachePath = temporaryDirectoryPath + '/local-media-metadata'

export const scanAudioFiles = async(dirPath: string) => {
  const files = await readDir(dirPath)
  return files.filter(file => {
    if (file.mimeType?.startsWith('audio/')) return true
    if (extname(file?.name ?? '') === 'ogg') return true
    return false
  }).map(file => file)
}

const clearPicCache = async() => {
  await unlink(picCachePath)
  cleared = true
}

export const readPic = async(dirPath: string): Promise<string> => {
  if (!native) return ''
  if (!cleared) await clearPicCache()
  return native.readPic(dirPath, picCachePath)
}

const writeQueue = new Map<string, { promise: Promise<void>, num: number }>()
const waitQueuePromise = async(key: string, run: () => Promise<void>): Promise<void> => {
  let task = writeQueue.get(key)
  if (!task) task = { promise: Promise.resolve(), num: 0 }
  task.num++
  task.promise = task.promise.finally(run).finally(() => {
    let task = writeQueue.get(key)
    if (!task) return
    task.num--
    if (task.num > 0) writeQueue.set(key, task)
    else writeQueue.delete(key)
  })
  writeQueue.set(key, task)
  return task.promise
}

/**
 * Read Metadata
 */
export const readMetadata = async(filePath: string): Promise<MusicMetadataFull | null> => {
  if (!native) return null
  return native.readMetadata(filePath)
}

/**
 * Write Metadata
 */
export const writeMetadata = async(filePath: string, metadata: MusicMetadata, isOverwrite = false): Promise<void> => {
  if (!native) return
  return waitQueuePromise(filePath, () => native!.writeMetadata(filePath, metadata, isOverwrite))
}

/**
 * Write Pic
 */
export const writePic = async(filePath: string, picPath: string): Promise<void> => {
  if (!native) return
  return waitQueuePromise(filePath, () => native!.writePic(filePath, picPath))
}

/**
 * Read Lyric
 */
export const readLyric = async(filePath: string, isReadLrcFile: boolean = true): Promise<string> => {
  if (!native) return ''
  return native.readLyric(filePath, isReadLrcFile)
}

/**
 * Write Lyric
 */
export const writeLyric = async(filePath: string, lyric: string): Promise<void> => {
  if (!native) return
  return waitQueuePromise(filePath, () => native!.writeLyric(filePath, lyric))
}
