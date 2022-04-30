import { TypedDocumentNode } from '@graphql-typed-document-node/core'
import gql from 'graphql-tag'
import { argv } from 'process'

const Variable = '$1fcbcbff-3e78-462f-b45c-668a3e09bfd8'
const VariableType = '$1fcbcbff-3e78-462f-b45c-668a3e09bfd9'

type Variable<T, Name extends string> = {
  [Variable]: [Name]
  [VariableType]?: T
}

type VariabledInput<T> = T extends string | number | Array<any>
  ? Variable<T, any> | T
  : Variable<T, any> | { [K in keyof T]: VariabledInput<T[K]> } | T

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never

export const $ = <Type, Name extends string>(name: Name) => {
  return { [Variable]: 'name' } as any as Variable<Type, Name>
}

type SelectOptions = {
  argTypes?: { [key: string]: string }
  args?: { [key: string]: any }
  selection?: Selection<any>
}

class $Field<
  Name extends string,
  Type,
  Parent extends string,
  Vars = {},
  Alias extends string = Name
> {
  public kind: 'field' = 'field'
  private type!: Type

  private vars!: Vars

  constructor(public name: Name, private alias: Alias, public options: SelectOptions) {}

  as<Rename extends string>(alias: Rename): $Field<Name, Type, Parent, Vars, Rename> {
    return new $Field(this.name, alias, this.options)
  }
}

class $Base<Name extends string> {
  constructor(name: string) {}
  protected $_select<Key extends string>(
    name: Key,
    options: SelectOptions = {}
  ): $Field<Key, any, Name, any> {
    return new $Field(name, name, options)
  }
}

class $Union<T, Name extends String> {
  private type!: T
  private name!: Name

  constructor(private selectorClasses: { [K in keyof T]: { new (): T[K] } }) {}
  $on<Type extends keyof T, Sel extends Selection<T[Type]>>(
    alternative: Type,
    selectorFn: (selector: T[Type]) => Sel
  ): $UnionSelection<JoinFields<Sel>, ExtractVariables<Sel>> {
    const selection = selectorFn(new this.selectorClasses[alternative]())

    return new $UnionSelection(alternative as string, selection)
  }
}

class $UnionSelection<T, Vars> {
  public kind: 'union' = 'union'
  private vars!: Vars
  constructor(public alternativeName: string, public alternativeSelection: Selection<T>) {}
}

type Selection<_any> = ReadonlyArray<$Field<any, any, any, any> | $UnionSelection<any, any>>

type JoinFields<X extends Selection<any>> = UnionToIntersection<
  {
    [I in keyof X & number]: X[I] extends $Field<any, infer Type, any, any, infer Alias>
      ? { [K in Alias]: Type }
      : never
  }[keyof X & number]
> &
  (
    | {}
    | {
        [I in keyof X & number]: X[I] extends $UnionSelection<infer Type, any> ? Type : never
      }[keyof X & number]
  )

type ExtractInputVariables<Inputs> = Inputs extends Variable<infer VType, infer VName>
  ? { [key in VName]: VType }
  : Inputs extends string | number | boolean
  ? {}
  : UnionToIntersection<{ [K in keyof Inputs]: ExtractInputVariables<Inputs[K]> }[keyof Inputs]>

type ExtractVariables<Sel extends Selection<any>, ExtraVars = {}> = UnionToIntersection<
  {
    [I in keyof Sel & number]: Sel[I] extends $Field<any, any, any, infer Vars, any>
      ? Vars
      : Sel[I] extends $UnionSelection<any, infer Vars>
      ? Vars
      : never
  }[keyof Sel & number]
> &
  ExtractInputVariables<ExtraVars>

function fieldToQuery(prefix: string, field: $Field<any, any, any, any, any>) {
  const variables = new Map<string, string>()

  function extractTextAndVars(field: $Field<any, any, any, any, any> | $UnionSelection<any, any>) {
    if (field.kind === 'field') {
      let retVal = field.name
      const args = field.options.args,
        argTypes = field.options.argTypes
      if (args) {
        retVal += '('
        for (let [argName, argVal] of Object.entries(args)) {
          if (Variable in argVal) {
            const argVarName = argVal[Variable]
            const argVarType = argTypes[argName]
            variables.set(argVarName, argVarType)
            retVal += argName + ': $' + argVarName
          } else {
            retVal += argName + ': ' + JSON.stringify(argVal)
          }
        }
        retVal += ')'
      }
      let sel = field.options.selection
      if (sel) {
        retVal += '{'
        for (let subField of sel) {
          retVal += extractTextAndVars(subField)
        }
        retVal += '}'
      }
      return retVal + ' '
    } else if (field.kind === 'union') {
      let retVal = '... on ' + field.alternativeName + ':{'
      for (let subField of field.alternativeSelection) {
        retVal += extractTextAndVars(subField)
      }
      retVal += '}'

      return retVal + ' '
    }
  }

  const queryRaw = extractTextAndVars(field)

  const queryBody = queryRaw.substring(queryRaw.indexOf('{'))

  const varList = Array.from(variables.entries())
  let ret = 'query'
  if (varList.length) {
    ret += '(' + varList.map(([name, kind]) => '$' + name + ':' + kind).join(',') + ')'
  }
  ret += queryBody

  return ret
}

export function query<Sel extends Selection<$RootTypes.query>>(
  selectFn: (q: $RootTypes.query) => Sel
) {
  let field = new $Field<'query', JoinFields<Sel>, '$Root', ExtractVariables<Sel>>(
    'query',
    'query',
    {
      selection: selectFn(new $Root.query()),
    }
  )
  return gql(fieldToQuery('query', field)) as any as TypedDocumentNode<
    JoinFields<Sel>,
    ExtractVariables<Sel>
  >
}

export function mutation<Sel extends Selection<$RootTypes.mutation>>(
  selectFn: (q: $RootTypes.mutation) => Sel
) {
  let field = new $Field<'mutation', JoinFields<Sel>, '$Root', ExtractVariables<Sel>>(
    'mutation',
    'mutation',
    {
      selection: selectFn(new $Root.mutation()),
    }
  )
  return gql(fieldToQuery('mutation', field)) as any as TypedDocumentNode<
    JoinFields<Sel>,
    ExtractVariables<Sel>
  >
}

export function subscription<Sel extends Selection<$RootTypes.subscription>>(
  selectFn: (q: $RootTypes.mutation) => Sel
) {
  let field = new $Field<'subscription', JoinFields<Sel>, '$Root', ExtractVariables<Sel>>(
    'subscription',
    'subscription',
    {
      selection: selectFn(new $Root.mutation()),
    }
  )
  return gql(fieldToQuery('subscription', field)) as any as TypedDocumentNode<
    JoinFields<Sel>,
    ExtractVariables<Sel>
  >
}

/**
 * The query root
 */
export class Query extends $Base<'Query'> {
  constructor() {
    super('Query')
  }

  cardById<
    Args extends VariabledInput<{
      cardId: string | undefined
    }>,
    Sel extends Selection<Card>
  >(
    args: Args,
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'cardById', JoinFields<Sel> | undefined, 'Query', ExtractVariables<Sel, Args>> {
    const options = {
      argTypes: {
        cardId: 'string | undefined',
      },
      args,

      selection: selectorFn(new Card()),
    }
    return this.$_select('cardById' as const, options)
  }

  drawCard<Sel extends Selection<Card>>(
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'drawCard', JoinFields<Sel>, 'Query'> {
    const options = {
      selection: selectorFn(new Card()),
    }
    return this.$_select('drawCard' as const, options)
  }

  drawChangeCard<Sel extends Selection<ChangeCard>>(
    selectorFn: (s: ChangeCard) => [...Sel]
  ): $Field<'drawChangeCard', JoinFields<Sel>, 'Query'> {
    const options = {
      selection: selectorFn(new ChangeCard()),
    }
    return this.$_select('drawChangeCard' as const, options)
  }

  listCards<Sel extends Selection<Card>>(
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'listCards', Array<JoinFields<Sel>>, 'Query'> {
    const options = {
      selection: selectorFn(new Card()),
    }
    return this.$_select('listCards' as const, options)
  }

  myStacks<Sel extends Selection<CardStack>>(
    selectorFn: (s: CardStack) => [...Sel]
  ): $Field<'myStacks', Array<JoinFields<Sel>> | undefined, 'Query'> {
    const options = {
      selection: selectorFn(new CardStack()),
    }
    return this.$_select('myStacks' as const, options)
  }

  nameables<Sel extends Selection<Nameable>>(
    selectorFn: (s: Nameable) => [...Sel]
  ): $Field<'nameables', Array<JoinFields<Sel>>, 'Query'> {
    const options = {
      selection: selectorFn(new Nameable()),
    }
    return this.$_select('nameables' as const, options)
  }
}

/**
 * Stack of cards
 */
export class CardStack extends $Base<'CardStack'> {
  constructor() {
    super('CardStack')
  }

  cards<Sel extends Selection<Card>>(
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'cards', Array<JoinFields<Sel>> | undefined, 'CardStack'> {
    const options = {
      selection: selectorFn(new Card()),
    }
    return this.$_select('cards' as const, options)
  }

  get name(): $Field<'name', string, 'CardStack'> {
    return this.$_select('name' as const)
  }
}

export enum SpecialSkills {
  /**
   * Lower enemy defense -5<br>
   */
  THUNDER = 'THUNDER',

  /**
   * Attack multiple Cards at once<br>
   */
  RAIN = 'RAIN',

  /**
   * 50% chance to avoid any attack<br>
   */
  FIRE = 'FIRE',
}

/**
 * Aws S3 File
 */
export class S3Object extends $Base<'S3Object'> {
  constructor() {
    super('S3Object')
  }

  get bucket(): $Field<'bucket', string, 'S3Object'> {
    return this.$_select('bucket' as const)
  }
  get key(): $Field<'key', string, 'S3Object'> {
    return this.$_select('key' as const)
  }
  get region(): $Field<'region', string, 'S3Object'> {
    return this.$_select('region' as const)
  }
}

export type JSON = unknown

export class ChangeCard extends $Union<
  { SpecialCard: SpecialCard; EffectCard: EffectCard },
  'ChangeCard'
> {
  constructor() {
    super({ SpecialCard: SpecialCard, EffectCard: EffectCard })
  }
}

export class Nameable extends $Base<'Nameable'> {
  constructor() {
    super('Nameable')
  }
  get name(): $Field<'name', string, 'Nameable'> {
    return this.$_select('name' as const)
  }
}

/**
 * Card used in card game<br>
 */
export class Card extends $Base<'Card'> {
  constructor() {
    super('Card')
  }

  get Attack(): $Field<'Attack', number, 'Card'> {
    return this.$_select('Attack' as const)
  }
  get Children(): $Field<'Children', number | undefined, 'Card'> {
    return this.$_select('Children' as const)
  }
  get Defense(): $Field<'Defense', number, 'Card'> {
    return this.$_select('Defense' as const)
  }
  attack<
    Args extends VariabledInput<{
      cardID: Array<string>
    }>,
    Sel extends Selection<Card>
  >(
    args: Args,
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'attack', Array<JoinFields<Sel>> | undefined, 'Card', ExtractVariables<Sel, Args>> {
    const options = {
      argTypes: {
        cardID: 'Array<string>',
      },
      args,

      selection: selectorFn(new Card()),
    }
    return this.$_select('attack' as const, options)
  }

  cardImage<Sel extends Selection<S3Object>>(
    selectorFn: (s: S3Object) => [...Sel]
  ): $Field<'cardImage', JoinFields<Sel> | undefined, 'Card'> {
    const options = {
      selection: selectorFn(new S3Object()),
    }
    return this.$_select('cardImage' as const, options)
  }

  get description(): $Field<'description', string, 'Card'> {
    return this.$_select('description' as const)
  }
  get id(): $Field<'id', string, 'Card'> {
    return this.$_select('id' as const)
  }
  get image(): $Field<'image', string, 'Card'> {
    return this.$_select('image' as const)
  }
  get info(): $Field<'info', string, 'Card'> {
    return this.$_select('info' as const)
  }
  get name(): $Field<'name', string, 'Card'> {
    return this.$_select('name' as const)
  }
  get skills(): $Field<'skills', Array<SpecialSkills> | undefined, 'Card'> {
    return this.$_select('skills' as const)
  }
}

export class Mutation extends $Base<'Mutation'> {
  constructor() {
    super('Mutation')
  }

  addCard<
    Args extends VariabledInput<{
      card: createCard
    }>,
    Sel extends Selection<Card>
  >(
    args: Args,
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'addCard', JoinFields<Sel>, 'Mutation', ExtractVariables<Sel, Args>> {
    const options = {
      argTypes: {
        card: 'createCard',
      },
      args,

      selection: selectorFn(new Card()),
    }
    return this.$_select('addCard' as const, options)
  }
}

export class Subscription extends $Base<'Subscription'> {
  constructor() {
    super('Subscription')
  }

  deck<Sel extends Selection<Card>>(
    selectorFn: (s: Card) => [...Sel]
  ): $Field<'deck', Array<JoinFields<Sel>> | undefined, 'Subscription'> {
    const options = {
      selection: selectorFn(new Card()),
    }
    return this.$_select('deck' as const, options)
  }
}

export class SpecialCard extends $Base<'SpecialCard'> {
  constructor() {
    super('SpecialCard')
  }

  get effect(): $Field<'effect', string, 'SpecialCard'> {
    return this.$_select('effect' as const)
  }
  get name(): $Field<'name', string, 'SpecialCard'> {
    return this.$_select('name' as const)
  }
  get thing(): $Field<'thing', string, 'SpecialCard'> {
    return this.$_select('thing' as const)
  }
}

export class EffectCard extends $Base<'EffectCard'> {
  constructor() {
    super('EffectCard')
  }

  get effectSize(): $Field<'effectSize', number, 'EffectCard'> {
    return this.$_select('effectSize' as const)
  }
  get name(): $Field<'name', string, 'EffectCard'> {
    return this.$_select('name' as const)
  }
  thing<Sel extends Selection<Number>>(
    selectorFn: (s: Number) => [...Sel]
  ): $Field<'thing', JoinFields<Sel>, 'EffectCard'> {
    const options = {
      selection: selectorFn(new Number()),
    }
    return this.$_select('thing' as const, options)
  }
}

/**
 * create card inputs<br>
 */
export type createCard = {
  skills: Array<SpecialSkills> | undefined
  name: string
  description: string
  Children: number | undefined
  Attack: number
  Defense: number
}

const $Root = {
  query: Query,
  mutation: Mutation,
  subscription: Subscription,
}

namespace $RootTypes {
  export type query = Query
  export type mutation = Mutation
  export type subscription = Subscription
}
