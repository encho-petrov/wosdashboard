# Build Stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy dependency files first (better caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN go build -o main .

# Run Stage
FROM alpine:latest

WORKDIR /app

# Install basic certificates for HTTPS calls
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/main .
COPY --from=builder /app/appsettings.json . 

# Create reports directory
RUN mkdir reports

# Expose port
EXPOSE 8080

# Command to run
CMD ["./main"]
