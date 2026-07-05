export interface UseCaseSuccess<T> {
    success: true;
    data: T;
}

export interface UseCaseFailure {
    success: false;
    message: string;
}

export type UseCaseResult<T> =
    | UseCaseSuccess<T>
    | UseCaseFailure;