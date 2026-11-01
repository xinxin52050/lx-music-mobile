/**
 * iOS 版文件系统实现。
 *
 * 原版 `react-native-file-system` 只实现了 Android（仓库内没有 ios/ 目录），
 * 在 iOS 上 NativeModules.FileSystemModule 不存在，模块初始化调用 getConstants()
 * 时会直接抛 LINKING_ERROR 导致 App 启动崩溃。
 *
 * 这里用 iOS 可用的 `react-native-fs` 实现同一套接口，供 fs.ts 在 iOS 上替换使用。
 */
import RNFS from 'react-native-fs'
import pako from 'pako'

export interface FileType {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  lastModified: number
  canRead: boolean
  data: string
  mimeType: string
  size: number
}

export type Encoding = 'base64' | 'utf8'
export type HashAlgorithm = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'

export interface OpenDocumentOptions {
  mimeTypes?: string[]
  extTypes?: string[]
  multi?: boolean
  toPath?: string
  encoding?: Encoding
}

export const Dirs = {
  CacheDir: RNFS.CachesDirectoryPath,
  DocumentDir: RNFS.DocumentDirectoryPath,
  MainBundleDir: RNFS.MainBundlePath,
  // iOS 沙盒没有“外置存储”，统一落到 Documents
  SDCardDir: RNFS.DocumentDirectoryPath,
}

const mimeMap: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ape: 'audio/x-ape',
  opus: 'audio/opus',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  json: 'application/json',
  txt: 'text/plain',
  lrc: 'text/plain',
  db: 'application/octet-stream',
}

const getMimeType = (name: string, isDirectory: boolean) => {
  if (isDirectory) return 'inode/directory'
  const ext = name.includes('.') ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return mimeMap[ext] ?? 'application/octet-stream'
}

const isDir = (v: any) => typeof v === 'function' ? !!v() : !!v

const toFileType = (info: any, path?: string): FileType => {
  const isDirectory = isDir(info.isDirectory)
  const name = info.name ?? (path ? path.split('/').pop() ?? '' : '')
  return {
    name,
    path: path ?? info.path,
    isDirectory,
    isFile: typeof info.isFile === 'function' ? !!info.isFile() : !isDirectory,
    lastModified: info.mtime ? new Date(info.mtime).getTime() : Date.now(),
    canRead: true,
    data: '',
    mimeType: getMimeType(name, isDirectory),
    size: Number(info.size ?? 0),
  }
}

const toUint8 = (buf: Buffer | Uint8Array) => new Uint8Array(buf as Uint8Array)

export const getExternalStoragePaths = async(_isRemovable?: boolean): Promise<string[]> => []

export const FileSystem = {
  async cp(source: string, target: string): Promise<void> {
    await RNFS.copyFile(source, target)
  },

  async exists(path: string): Promise<boolean> {
    return RNFS.exists(path)
  },

  async ls(path: string): Promise<FileType[]> {
    const items = await RNFS.readDir(path)
    return items.map(item => toFileType(item, item.path))
  },

  async mkdir(path: string): Promise<FileType> {
    await RNFS.mkdir(path)
    return toFileType(await RNFS.stat(path), path)
  },

  async mv(source: string, target: string): Promise<boolean> {
    await RNFS.moveFile(source, target)
    return true
  },

  async rename(source: string, name: string): Promise<boolean> {
    const dir = source.substring(0, source.lastIndexOf('/'))
    await RNFS.moveFile(source, `${dir}/${name}`)
    return true
  },

  async readFile(path: string, encoding: Encoding = 'utf8'): Promise<string> {
    return RNFS.readFile(path, encoding)
  },

  async stat(path: string): Promise<FileType> {
    return toFileType(await RNFS.stat(path), path)
  },

  async unlink(path: string): Promise<boolean> {
    if (!await RNFS.exists(path)) return false
    await RNFS.unlink(path)
    return true
  },

  async writeFile(path: string, data: string, encoding: Encoding = 'utf8'): Promise<void> {
    await RNFS.writeFile(path, data, encoding)
  },

  async appendFile(path: string, data: string, encoding: Encoding = 'utf8'): Promise<void> {
    await RNFS.appendFile(path, data, encoding)
  },

  async gzipFile(source: string, target: string): Promise<void> {
    const base64 = await RNFS.readFile(source, 'base64')
    const out = pako.gzip(toUint8(Buffer.from(base64, 'base64')))
    await RNFS.writeFile(target, Buffer.from(out).toString('base64'), 'base64')
  },

  async unGzipFile(source: string, target: string): Promise<void> {
    const base64 = await RNFS.readFile(source, 'base64')
    const out = pako.ungzip(toUint8(Buffer.from(base64, 'base64')))
    await RNFS.writeFile(target, Buffer.from(out).toString('base64'), 'base64')
  },

  async gzipString(data: string, encoding: Encoding = 'utf8'): Promise<string> {
    const raw = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8')
    return Buffer.from(pako.gzip(toUint8(raw))).toString('base64')
  },

  async unGzipString(data: string, encoding: Encoding = 'utf8'): Promise<string> {
    const raw = pako.ungzip(toUint8(Buffer.from(data, 'base64')))
    return Buffer.from(raw).toString(encoding === 'base64' ? 'base64' : 'utf8')
  },

  async hash(path: string, algorithm: HashAlgorithm = 'md5'): Promise<string> {
    return RNFS.hash(path, algorithm)
  },
}

export const AndroidScoped = {
  async getPersistedUriPermissions(): Promise<string[]> {
    return []
  },

  async releasePersistableUriPermission(_path: string): Promise<void> {
    // iOS 没有 SAF 授权概念，忽略
  },

  async openDocumentTree(_isPersist: boolean): Promise<FileType> {
    throw new Error('iOS 不支持选择文件夹')
  },

  async openDocument(_options: OpenDocumentOptions): Promise<FileType> {
    throw new Error('iOS 不支持选择文件')
  },
}
