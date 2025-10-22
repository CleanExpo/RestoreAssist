#!/bin/bash
# ============================================
# RestoreAssist Docker Quick Start Script
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker is installed: $(docker --version)"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose is installed: $(docker-compose --version)"

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    print_success "Docker daemon is running"
}

# Setup environment
setup_environment() {
    print_header "Setting Up Environment"

    if [ ! -f .env ]; then
        print_info "Creating .env file from template..."
        cp .env.docker .env
        print_warning "Please edit .env file with your configuration before continuing"
        print_info "Run: nano .env or code .env"
        read -p "Press Enter when ready to continue..."
    else
        print_success ".env file already exists"
    fi
}

# Build images
build_images() {
    print_header "Building Docker Images"

    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.prod.yml build
    else
        docker-compose build
    fi

    print_success "Images built successfully"
}

# Start services
start_services() {
    print_header "Starting Services"

    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi

    print_success "Services started successfully"
}

# Wait for services
wait_for_services() {
    print_header "Waiting for Services to be Ready"

    print_info "Waiting for database..."
    sleep 5

    print_info "Waiting for backend..."
    for i in {1..30}; do
        if curl -f http://localhost:3001/api/health &> /dev/null; then
            print_success "Backend is ready"
            break
        fi
        echo -n "."
        sleep 2
    done

    if [ "$ENVIRONMENT" != "production" ]; then
        print_info "Waiting for frontend..."
        for i in {1..30}; do
            if curl -f http://localhost:5173 &> /dev/null; then
                print_success "Frontend is ready"
                break
            fi
            echo -n "."
            sleep 2
        done
    fi
}

# Show status
show_status() {
    print_header "Service Status"

    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.prod.yml ps
    else
        docker-compose ps
    fi
}

# Show access URLs
show_urls() {
    print_header "Access URLs"

    if [ "$ENVIRONMENT" = "production" ]; then
        print_info "Frontend: http://localhost"
        print_info "Backend API: http://localhost/api"
        print_info "Health Check: http://localhost/health"
    else
        print_info "Frontend: http://localhost:5173"
        print_info "Backend API: http://localhost:3001"
        print_info "Database Admin: http://localhost:8080 (run: docker-compose --profile tools up -d adminer)"
    fi

    echo ""
    print_info "View logs: docker-compose logs -f"
    print_info "Stop services: docker-compose down"
}

# Main menu
show_menu() {
    echo ""
    print_header "RestoreAssist Docker Setup"
    echo ""
    echo "1) Start Development Environment"
    echo "2) Start Production Environment"
    echo "3) Stop All Services"
    echo "4) View Logs"
    echo "5) Rebuild Images"
    echo "6) Database Backup"
    echo "7) Database Restore"
    echo "8) Clean Up (Remove all containers and volumes)"
    echo "9) Exit"
    echo ""
}

# Main script
main() {
    check_prerequisites

    while true; do
        show_menu
        read -p "Select an option: " choice

        case $choice in
            1)
                ENVIRONMENT="development"
                setup_environment
                build_images
                start_services
                wait_for_services
                show_status
                show_urls
                ;;
            2)
                ENVIRONMENT="production"
                setup_environment
                build_images
                start_services
                wait_for_services
                show_status
                show_urls
                ;;
            3)
                print_header "Stopping Services"
                docker-compose down
                docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
                print_success "Services stopped"
                ;;
            4)
                print_header "Viewing Logs (Ctrl+C to exit)"
                docker-compose logs -f
                ;;
            5)
                print_header "Rebuilding Images"
                read -p "Development or Production? (dev/prod): " env_choice
                if [ "$env_choice" = "prod" ]; then
                    docker-compose -f docker-compose.prod.yml build --no-cache
                else
                    docker-compose build --no-cache
                fi
                print_success "Images rebuilt"
                ;;
            6)
                print_header "Creating Database Backup"
                bash ./docker/scripts/backup-db.sh
                ;;
            7)
                print_header "Restoring Database"
                ls -lh ./backups/*.sql.gz 2>/dev/null || print_warning "No backups found"
                read -p "Enter backup file path: " backup_file
                bash ./docker/scripts/restore-db.sh "$backup_file"
                ;;
            8)
                print_warning "This will remove all containers, networks, and volumes!"
                read -p "Are you sure? (yes/no): " confirm
                if [ "$confirm" = "yes" ]; then
                    docker-compose down -v
                    docker-compose -f docker-compose.prod.yml down -v 2>/dev/null || true
                    docker system prune -f
                    print_success "Cleanup complete"
                fi
                ;;
            9)
                print_success "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac

        read -p "Press Enter to continue..."
    done
}

# Run main function
main
