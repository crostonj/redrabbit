# Docker build and deployment scripts for Red Rabbit Orders Microservice (PowerShell)
param(
    [Parameter(Position=0)]
    [string]$Command,
    [Parameter(Position=1)]
    [string]$Version = "latest"
)

# Configuration
$IMAGE_NAME = "redrabbit/orders-api"
$REGISTRY = "ghcr.io"  # Change to your registry

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Show-Help {
    Write-Host "Red Rabbit Orders - Docker Management Script" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Usage: .\scripts\docker.ps1 <command> [options]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  dev             Start development environment"
    Write-Host "  build           Build production Docker image"
    Write-Host "  build-dev       Build development Docker image"
    Write-Host "  push            Push image to registry"
    Write-Host "  test            Run tests in container"
    Write-Host "  logs            View container logs"
    Write-Host "  shell           Open shell in running container"
    Write-Host "  cleanup         Clean up unused Docker resources"
    Write-Host "  health          Check container health"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\scripts\docker.ps1 dev                    # Start development environment"
    Write-Host "  .\scripts\docker.ps1 build v1.2.3          # Build with version tag"
    Write-Host "  .\scripts\docker.ps1 push v1.2.3           # Push specific version"
}

function Test-DockerAvailable {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker is not installed or not in PATH"
        exit 1
    }
    
    try {
        docker info | Out-Null
    }
    catch {
        Write-Error "Docker daemon is not running"
        exit 1
    }
}

function Start-Development {
    Write-Info "Starting development environment..."
    
    # Check if development image exists
    $imageExists = docker image inspect "${IMAGE_NAME}:dev" 2>$null
    if (-not $imageExists) {
        Write-Info "Development image not found, building..."
        Build-Development
    }
    
    # Start services
    docker-compose up -d
    
    # Wait for health checks
    Write-Info "Waiting for services to be healthy..."
    Start-Sleep -Seconds 10
    
    # Show status
    docker-compose ps
    
    Write-Success "Development environment started!"
    Write-Info "Services available:"
    Write-Info "  • API: http://localhost:3000"
    Write-Info "  • Database UI: http://localhost:8080 (adminer)"
    Write-Info "  • Email Testing: http://localhost:8025 (mailhog)"
    Write-Info "  • Logs: docker-compose logs -f"
}

function Build-Production {
    param([string]$Version = "latest")
    
    Write-Info "Building production image: ${IMAGE_NAME}:${Version}"
    
    $gitCommit = try { git rev-parse --short HEAD } catch { "unknown" }
    $buildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    docker build `
        --target production `
        --tag "${IMAGE_NAME}:${Version}" `
        --tag "${IMAGE_NAME}:latest" `
        --build-arg VERSION="${Version}" `
        --build-arg BUILD_DATE="${buildDate}" `
        --build-arg GIT_COMMIT="${gitCommit}" `
        .
    
    Write-Success "Production image built: ${IMAGE_NAME}:${Version}"
    
    # Show image size
    $sizeBytes = docker image inspect "${IMAGE_NAME}:${Version}" --format='{{.Size}}'
    $sizeMB = [math]::Round($sizeBytes / 1024 / 1024, 2)
    Write-Info "Image size: ${sizeMB}MB"
}

function Build-Development {
    Write-Info "Building development image: ${IMAGE_NAME}:dev"
    
    docker build `
        --target development `
        --tag "${IMAGE_NAME}:dev" `
        .
    
    Write-Success "Development image built: ${IMAGE_NAME}:dev"
}

function Push-Image {
    param([string]$Version = "latest")
    
    $fullName = "${REGISTRY}/${IMAGE_NAME}:${Version}"
    
    Write-Info "Pushing image: $fullName"
    
    # Tag for registry
    docker tag "${IMAGE_NAME}:${Version}" "$fullName"
    
    # Push
    docker push "$fullName"
    
    Write-Success "Image pushed: $fullName"
}

function Invoke-Tests {
    Write-Info "Running tests in container..."
    
    docker run --rm `
        --env NODE_ENV=test `
        --env DB_HOST=postgres `
        --env DB_NAME=redrabbit_orders_test `
        --env DB_USER=postgres `
        --env DB_PASSWORD=postgres_test_password `
        --env JWT_SECRET=test-jwt-secret-minimum-32-characters-long `
        --env API_KEY_SALT=test-api-key-salt-16-chars `
        --network redrabbit-dev-network `
        "${IMAGE_NAME}:dev" `
        npm test
    
    Write-Success "Tests completed"
}

function Show-Logs {
    Write-Info "Showing container logs..."
    docker-compose logs -f orders-api
}

function Open-Shell {
    $containerName = "redrabbit-orders-dev"
    
    $running = docker ps --format "table {{.Names}}" | Select-String "$containerName"
    if (-not $running) {
        Write-Error "Container $containerName is not running"
        Write-Info "Start development environment first: .\scripts\docker.ps1 dev"
        exit 1
    }
    
    Write-Info "Opening shell in container: $containerName"
    docker exec -it "$containerName" /bin/sh
}

function Invoke-Cleanup {
    Write-Info "Cleaning up unused Docker resources..."
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    # Remove unused networks
    docker network prune -f
    
    Write-Success "Cleanup completed"
}

function Test-Health {
    Write-Info "Checking container health..."
    
    $containerName = "redrabbit-orders-dev"
    
    $running = docker ps --format "table {{.Names}}" | Select-String "$containerName"
    if (-not $running) {
        Write-Error "Container $containerName is not running"
        exit 1
    }
    
    $healthStatus = docker inspect --format='{{.State.Health.Status}}' "$containerName"
    
    switch ($healthStatus) {
        "healthy" {
            Write-Success "Container is healthy"
        }
        "unhealthy" {
            Write-Error "Container is unhealthy"
            docker logs --tail 50 "$containerName"
            exit 1
        }
        "starting" {
            Write-Info "Container is starting up..."
        }
        default {
            Write-Warning "Health status: $healthStatus"
        }
    }
}

# Main script logic
Test-DockerAvailable

switch ($Command) {
    "dev" {
        Start-Development
    }
    "build" {
        Build-Production -Version $Version
    }
    "build-dev" {
        Build-Development
    }
    "push" {
        Push-Image -Version $Version
    }
    "test" {
        Invoke-Tests
    }
    "logs" {
        Show-Logs
    }
    "shell" {
        Open-Shell
    }
    "cleanup" {
        Invoke-Cleanup
    }
    "health" {
        Test-Health
    }
    { $_ -in @("help", "-h", "--help", "") } {
        Show-Help
    }
    default {
        Write-Error "Unknown command: $Command"
        Show-Help
        exit 1
    }
}