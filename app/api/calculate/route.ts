import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const rates = {
        'callout_fee': 350,
        'labour_per_hour': 145,
        'extraction_cat1_per_m2': 12,
        'dehumidifier_per_day': 95,
        'air_mover_per_day': 55,
        'structural_drying_per_day': 185,
        'mould_treatment_per_m2': 18,
        'containment_setup': 450,
        'hepa_vacuuming_per_m2': 8,
        'antimicrobial_per_m2': 14,
        'smoke_cleaning_per_m2': 16,
        'deodorisation_per_m2': 12,
        'ozone_treatment': 650,
        'tarping_per_m2': 22,
        'debris_removal_per_m3': 180,
        'structural_assessment': 550,
        'biohazard_cleaning_per_m2': 45,
        'disposal_per_bag': 35,
        'sanitisation_per_m2': 28
    };
    // Implementation Details Here
    return NextResponse.json({});
}