import { resolve, join, basename, extname } from 'path'
import { promises as fsp, existsSync } from 'fs'
import * as yml from 'js-yaml'
import { globby } from 'globby'
import defu from 'defu'
import { categories } from './categories'
import { ModuleInfo } from './types'
import { fetchGithubPkg, modulesDir, distDir, distFile } from './utils'

export async function sync (name, repo?: string, isNew: boolean = false) {
  const module = await getModule(name)

  // Repo
  if (repo) {
    module.repo = repo
  }

  if (!module.repo) {
    throw new Error(`repo not provided for ${name}`)
  }

  // Defaults
  if (!module.repo) {
    module.repo = repo
  }
  if (!module.github) {
    module.github = `https://github.com/${module.repo.replace('#', '/tree/')}`
  }
  if (!module.website) {
    module.website = module.github
  }

  // Fetch latest package.json from github
  const pkg = await fetchGithubPkg(module.repo)
  module.npm = pkg.name

  // Type
  if (module.repo.startsWith('nuxt-community/')) {
    module.type = 'community'
  } else if (module.repo.startsWith('nuxt/')) {
    module.type = 'official'
  } else {
    module.type = '3rd-party'
  }

  // Category
  if (!module.category) {
    if (!isNew) {
      throw new Error(`No category for ${name}`)
    } else {
      console.log(`[TODO] Add a category to ./modules/${name}.yml`)
    }
  } else if (!categories.includes(module.category)) {
    let newCat = module.category[0].toUpperCase() + module.category.substr(1)
    if (newCat.length <= 3) {
      newCat = newCat.toUpperCase()
    }
    if (categories.includes(newCat)) {
      module.category = newCat
    } else {
      throw new Error(`Unknown category ${module.category} for ${module.name}.\nSupported categories: ${categories.join(', ')}`)
    }
  }

  // TODO: Remove extra fields
  const validFields = [
    'name',
    'description',
    'npm',
    'repo',
    'icon',
    'github',
    'website',
    'learn_more',
    'category',
    'type',
    'maintainers',
    'compatibility'
  ]
  const invalidFields = []
  for (const key in module) {
    if (!validFields.includes(key)) {
      invalidFields.push(key)
      delete module[key]
    }
  }
  if (invalidFields.length) {
    console.warn(`Invalid fields for ./modules/${module.name}.yml`, invalidFields)
  }

  // Auto name
  if (!module.name) {
    module.name = (pkg.name.startsWith('@') ? pkg.name.split('/')[1] : pkg.name)
      .replace('nuxt-', '')
      .replace('-module', '')
  }

  // Maintainers
  // TODO: Sync with maintainers.app
  if (!module.maintainers.length) {
    const owner = module.repo.split('/')[0]
    if (owner !== 'nuxt-community' && owner !== 'nuxt') {
      module.maintainers.push({
        name: owner,
        github: owner
      })
    } else if (!isNew) {
      throw new Error(`No maintainer for ${module.name}`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[TODO] Add a maintainer to ./modules/${name}.yml`)
    }
  }

  // Default description
  if (!module.description) {
    module.description = pkg.description
  }

  // Compatibility

  // Write module
  await writeModule(module)

  return module
}

export async function getModule (name): Promise<ModuleInfo> {
  let module: ModuleInfo = {
    name,
    description: '',
    repo: '', // nuxt/example
    npm: '', // @nuxt/core
    icon: '', // url or filename from /static/icons
    github: '', // github link
    website: '',
    learn_more: '',
    category: 'Devtools', // see modules/_categories.json
    type: '3rd-party', // official, community, 3rd-party
    maintainers: [],
    compatibility: {
      nuxt: '^2.0.0',
      requires: {}
    }
  }

  const file = resolve(modulesDir, name + '.yml')
  if (existsSync(file)) {
    module = defu(yml.load(await fsp.readFile(file, 'utf-8')) as object, module)
  }

  return module
}

export async function writeModule (module) {
  const file = resolve(modulesDir, `${module.name}.yml`)
  await fsp.writeFile(file, yml.dump(module), 'utf8')
}

export async function readModules () {
  const globPattern = join(modulesDir, '*.yml').replace(/\\/g, '/')
  const names = (await globby(globPattern)).map(p => basename(p, extname(p))).filter(_ => _)

  return Promise.all(names.map(n => getModule(n)))
    .then(modules => modules.filter(m => m.name))
}

export async function syncAll () {
  const modules = await readModules()
  const updatedModules = await Promise.all(modules.map((module) => {
    return sync(module.name, module.repo)
  }))
  return updatedModules
}

export async function build () {
  const modules = await readModules()
  await fsp.mkdir(distDir, { recursive: true })
  await fsp.writeFile(distFile, JSON.stringify(modules, null, 2))
}
