export class HttpError extends Error {
    constructor(
        public code: number,
        error: Error,
    ) {
        super(error.message);
        this.stack = error.stack;
        this.name = "HttpError";
    }
}

export class DestinationInvalidError extends HttpError {
    constructor(error: Error) {
        super(404, error);
        this.name = "DestinationInvalidError";
    }
}

export class AuthError extends HttpError {
    constructor(
        public code: number,
        error: Error,
    ) {
        super(code, error);
        this.name = "AuthError";
    }
}

export class ResponseTooLargeError extends HttpError {
    constructor(
        error: Error,
        public size: number,
        public maxSize: number,
    ) {
        super(500, error);
        this.name = "ResponseTooLargeError";
    }
}

export class InvalidDelegationError extends HttpError {
    constructor(error: Error) {
        super(403, error);
        this.name = "InvalidDelegationError";
    }
}

export class ReplicaNotUpToDateError extends Error {
    public static byTimestamp(
        replicaTimestamp: bigint,
        clientTimestamp: bigint,
        failedPostCheck: boolean,
    ): ReplicaNotUpToDateError {
        const message = `Replica not up to date (timestamp). Client: ${clientTimestamp}. Replica: ${replicaTimestamp}. FailedPostCheck: ${failedPostCheck}`;

        return new ReplicaNotUpToDateError(message);
    }

    private constructor(message: string) {
        super(message);
    }
}

export function toCanisterResponseError(error: Error): HttpError | ReplicaNotUpToDateError {
    if (error instanceof ReplicaNotUpToDateError) {
        return error;
    }

    let code = 500;

    if (error.message.includes("DestinationInvalid")) {
        // this will allow us to short-circuit the retry mechanism in this circumstance
        return new DestinationInvalidError(error);
    }

    const tooLarge = responseTooLarge(error);
    if (tooLarge) {
        return tooLarge;
    }

    const statusLine = error.message
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .find((l) => l.startsWith("code:") || l.startsWith("http status code:"));

    if (statusLine) {
        const parts = statusLine.split(":");
        if (parts && parts.length > 1) {
            let valueText = parts[1].trim();
            const valueParts = valueText.split(" ");
            if (valueParts && valueParts.length > 1) {
                valueText = valueParts[0].trim();
            }
            code = parseInt(valueText, 10);
            if (isNaN(code)) {
                code = 500;
            }
        }
    }

    if (code === 403 && error.message.includes("Invalid delegation")) {
        return new InvalidDelegationError(error);
    }

    return code === 401 || code === 403 ? new AuthError(code, error) : new HttpError(code, error);
}

function responseTooLarge(error: Error): ResponseTooLargeError | undefined {
    const regex = /application payload size \((\d+)\) cannot be larger than (\d+)/;
    const match = error.message.match(regex);

    if (match) {
        const size = parseInt(match[1]);
        const maxSize = parseInt(match[2]);
        return new ResponseTooLargeError(error, size, maxSize);
    }
    return undefined;
}

export class UnsupportedValueError extends Error {
    constructor(msg: string, value: never) {
        super(`${msg}: ${value}`);
    }
}
