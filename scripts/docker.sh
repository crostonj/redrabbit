#!/usr/bin/env bash
# Docker build and deployment scripts for Red Rabbit Orders Microservice

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="redrabbit/orders-api"
REGISTRY="ghcr.io" # Change to your registry
VERSION=${1:-"latest"}

print_help() {
    echo -e "${BLUE}Red Rabbit Orders - Docker Management Script${NC}"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  dev             Start development environment"
    echo "  build           Build production Docker image"
    echo "  build-dev       Build development Docker image"
    echo "  push            Push image to registry"
    echo "  deploy          Deploy to production"
    echo "  test            Run tests in container"
    echo "  logs            View container logs"
    echo "  shell           Open shell in running container"
    echo "  cleanup         Clean up unused Docker resources"
    echo "  health          Check container health"
    echo ""
    echo "Examples:"
    echo "  $0 dev                    # Start development environment"
    echo "  $0 build v1.2.3          # Build with version tag"
    echo "  $0 push v1.2.3           # Push specific version"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

start_dev() {
    log_info "Starting development environment..."
    
    # Build development image if it doesn't exist
    if ! docker image inspect "${IMAGE_NAME}:dev" &> /dev/null; then
        log_info "Development image not found, building..."
        build_dev
    fi
    
    # Start services
    docker-compose up -d
    
    # Wait for health checks
    log_info "Waiting for services to be healthy..."
    sleep 10
    
    # Show status
    docker-compose ps
    
    log_success "Development environment started!"
    log_info "Services available:"
    log_info "  • API: http://localhost:3000"
    log_info "  • Database UI: http://localhost:8080 (adminer)"
    log_info "  • Email Testing: http://localhost:8025 (mailhog)"
    log_info "  • Logs: docker-compose logs -f"
}

build_production() {
    local version=${1:-"latest"}
    log_info "Building production image: ${IMAGE_NAME}:${version}"
    
    docker build \
        --target production \
        --tag "${IMAGE_NAME}:${version}" \
        --tag "${IMAGE_NAME}:latest" \
        --build-arg VERSION="${version}" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
        .
    
    log_success "Production image built: ${IMAGE_NAME}:${version}"
    
    # Show image size
    local size=$(docker image inspect "${IMAGE_NAME}:${version}" --format='{{.Size}}' | awk '{print int($1/1024/1024) "MB"}')
    log_info "Image size: ${size}"
}

build_dev() {
    log_info "Building development image: ${IMAGE_NAME}:dev"
    
    docker build \
        --target development \
        --tag "${IMAGE_NAME}:dev" \
        .
    
    log_success "Development image built: ${IMAGE_NAME}:dev"
}

push_image() {
    local version=${1:-"latest"}
    local full_name="${REGISTRY}/${IMAGE_NAME}:${version}"
    
    log_info "Pushing image: ${full_name}"
    
    # Tag for registry
    docker tag "${IMAGE_NAME}:${version}" "${full_name}"
    
    # Push
    docker push "${full_name}"
    
    log_success "Image pushed: ${full_name}"
}

run_tests() {
    log_info "Running tests in container..."
    
    docker run --rm \
        --env NODE_ENV=test \
        --env DB_HOST=postgres \
        --env DB_NAME=redrabbit_orders_test \
        --env DB_USER=postgres \
        --env DB_PASSWORD=postgres_test_password \
        --env JWT_SECRET=test-jwt-secret-minimum-32-characters-long \
        --env API_KEY_SALT=test-api-key-salt-16-chars \
        --network redrabbit-dev-network \
        "${IMAGE_NAME}:dev" \
        npm test
    
    log_success "Tests completed"
}

show_logs() {
    log_info "Showing container logs..."
    docker-compose logs -f orders-api
}

open_shell() {
    local container_name="redrabbit-orders-dev"
    
    if ! docker ps | grep -q "${container_name}"; then
        log_error "Container ${container_name} is not running"
        log_info "Start development environment first: $0 dev"
        exit 1
    fi
    
    log_info "Opening shell in container: ${container_name}"
    docker exec -it "${container_name}" /bin/sh
}

cleanup() {
    log_info "Cleaning up unused Docker resources..."
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    # Remove unused networks
    docker network prune -f
    
    log_success "Cleanup completed"
}

check_health() {
    log_info "Checking container health..."
    
    local container_name="redrabbit-orders-dev"
    
    if ! docker ps | grep -q "${container_name}"; then
        log_error "Container ${container_name} is not running"
        exit 1
    fi
    
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' "${container_name}")
    
    case "${health_status}" in
        "healthy")
            log_success "Container is healthy"
            ;;
        "unhealthy")
            log_error "Container is unhealthy"
            docker logs --tail 50 "${container_name}"
            exit 1
            ;;
        "starting")
            log_info "Container is starting up..."
            ;;
        *)
            log_warning "Health status: ${health_status}"
            ;;
    esac
}

deploy() {
    local version=${1:-"latest"}
    
    log_info "Deploying version: ${version}"
    
    # Build production image
    build_production "${version}"
    
    # Push to registry
    push_image "${version}"
    
    log_success "Deployment completed for version: ${version}"
    log_info "Update your production environment to use: ${REGISTRY}/${IMAGE_NAME}:${version}"
}

# Main script logic
case "${1}" in
    "dev")
        check_docker
        start_dev
        ;;
    "build")
        check_docker
        build_production "${2}"
        ;;
    "build-dev")
        check_docker
        build_dev
        ;;
    "push")
        check_docker
        push_image "${2}"
        ;;
    "deploy")
        check_docker
        deploy "${2}"
        ;;
    "test")
        check_docker
        run_tests
        ;;
    "logs")
        check_docker
        show_logs
        ;;
    "shell")
        check_docker
        open_shell
        ;;
    "cleanup")
        check_docker
        cleanup
        ;;
    "health")
        check_docker
        check_health
        ;;
    "help"|"-h"|"--help"|"")
        print_help
        ;;
    *)
        log_error "Unknown command: ${1}"
        print_help
        exit 1
        ;;
esac