import * as pathe from 'pathe'

export function getModuleId(file: string, paths: string | string[]) {
  if (!Array.isArray(paths)) {
    paths = [paths]
  }
  let path = paths.find((path) => file.includes(path))
  if (path === undefined) {
    throw new Error(
      `The file ${file} does not belong to any of the paths ${paths}`
    )
  }
  if (!path.startsWith(pathe.sep)) {
    path = pathe.sep + path
  }
  if (!path.endsWith(pathe.sep)) {
    path = path + pathe.sep
  }
  const parsedPath = pathe.parse(file)
  const parentModule = parsedPath.dir.split(path)[1]
  let id = parsedPath.name
  if (parentModule)
    if (parsedPath.name === 'index') {
      id = parentModule
    } else {
      id = `${parentModule}_${parsedPath.name}`
    }
  const validId = id
    .replaceAll(pathe.sep, '_')
    .replaceAll(/[^\p{L}\p{N}_$]/gu, '_')
    .replace(/^\d/, '_$&')
  return validId
}


