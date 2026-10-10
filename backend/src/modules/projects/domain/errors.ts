export type ProjectsFailureKind = 'invalid' | 'forbidden' | 'not_found' | 'conflict'

export class ProjectsFailure extends Error {
  constructor(
    public readonly kind: ProjectsFailureKind,
    message: string,
  ) {
    super(message)
  }
}
