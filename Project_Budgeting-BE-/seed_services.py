import os
import django
import sys

# Setup django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
django.setup()

from product_group.models import Product_Services, ProductGroup

def seed_services():
    # Define mapping from service name to technologies string
    services_map = {
        "SAP ABAP": "SAP ABAP",
        "Mobile Developer (Flutter/Dart)": "Flutter, Dart",
        "Backend Developer (Django)": "Django, Python, Django REST Framework, PostgreSQL",
        "Full Stack Developer (MERN)": "MongoDB, Express.js, React, Node.js",
        "Web Development": "HTML, CSS, JavaScript, React",
        "Odoo Implementation": "Odoo, CRM, Sales, Inventory, Purchase, Helpdesk, POS",
        "Odoo CRM": "Odoo CRM",
        "Odoo Sales": "Odoo Sales",
        "Odoo Helpdesk": "Odoo Helpdesk",
        "Odoo Inventory": "Odoo Inventory",
        "Odoo Purchase": "Odoo Purchase",
        "Odoo POS": "Odoo POS",
        "Frontend Development": "HTML, CSS, JavaScript, React",
        "Backend Development": "Django, Python, Node.js, Express.js",
        "Full Stack Development": "MongoDB, Express.js, React, Node.js, Django",
        "Mobile App Development (iOS)": "Swift, Objective-C",
        "Mobile App Development (Android)": "Kotlin, Java",
        "Cross Platform App Development (Flutter / React Native)": "Flutter, React Native",
        "UI/UX Design": "Figma, Adobe XD, Sketch",
        "Web Design": "HTML, CSS, Figma",
        "API Development": "Django REST API, FastAPI",
        "Microservices Development": "Docker, Kubernetes, REST, gRPC",
        "CMS Development (WordPress / Drupal)": "WordPress, Drupal, PHP",
        "E-commerce Development": "Magento, Shopify, WooCommerce",
        "Custom Software Development": "Python, Java, C#, C++",
        "SAP FICO": "SAP ERP",
        "SAP MM": "SAP ERP",
        "SAP SD": "SAP ERP",
        "SAP PP": "SAP ERP",
        "SAP HCM": "SAP ERP",
        "SAP CRM": "SAP CRM",
        "SAP SCM": "SAP SCM",
        "SAP SuccessFactors": "SAP SuccessFactors",
        "SAP Ariba": "SAP Ariba",
        "Technology Mapping": "General Technology Mapping"
    }

    # Ensure a default product group exists for these services
    group, _ = ProductGroup.objects.get_or_create(
        product_group_name="Development & Implementation Services",
        defaults={"description": "Automatically generated product group for IT services"}
    )

    created_count = 0
    updated_count = 0

    for service_name, tech in services_map.items():
        service, created = Product_Services.objects.get_or_create(
            product_service_name=service_name,
            defaults={
                "product_group": group,
                "description": f"{service_name} services.",
                "technologies": tech
            }
        )
        
        if created:
            created_count += 1
        else:
            # Update existing service with technologies if it wasn't there
            if service.technologies != tech or service.product_group != group:
                service.technologies = tech
                if not service.product_group:
                    service.product_group = group
                service.save()
                updated_count += 1

    print(f"Successfully seeded services. Created: {created_count}, Updated: {updated_count}.")

if __name__ == '__main__':
    seed_services()
