import * as Yup from 'yup';

export type LoginFormValues = {
    email: string;
    password: string;
};

export type SignupFormValues = {
    email: string;
    phone: string;
    password: string;
    confirm_password: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    agree_to_terms: boolean;
};

export type ForgotPasswordFormValues = {
    email: string;
};

export const LoginValidationSchema = Yup.object().shape({
    email: Yup.string()
        .trim()
        .email('Please enter a valid email address.')
        .required('Email is required.'),
    password: Yup.string()
        .min(6, 'Password must be at least 6 characters.')
        .required('Password is required.'),
});

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;
const simplePhoneRegex = /^\+?[1-9]\d{7,14}$/;

export const SignupValidationSchema = Yup.object().shape({
    email: Yup.string()
        .trim()
        .email('Please enter a valid email address.')
        .required('Email is required.'),
    phone: Yup.string()
        .trim()
        .matches(simplePhoneRegex, 'Please enter a valid phone number.')
        .required('Phone number is required.'),
    password: Yup.string()
        .min(8, 'Password must be at least 8 characters.')
        .matches(
            strongPasswordRegex,
            'Password must include uppercase, lowercase, number, and special character.'
        )
        .required('Password is required.'),
    confirm_password: Yup.string()
        .oneOf([Yup.ref('password')], 'Passwords do not match.')
        .required('Please confirm your password.'),
    first_name: Yup.string()
        .trim()
        .min(2, 'First name is too short.')
        .required('First name is required.'),
    last_name: Yup.string()
        .trim()
        .min(2, 'Last name is too short.')
        .required('Last name is required.'),
    date_of_birth: Yup.date()
        .typeError('Date of birth is required.')
        .required('Date of birth is required.'),
    agree_to_terms: Yup.boolean()
        .oneOf([true], 'You must agree to the terms and conditions.')
        .required('You must agree to the terms and conditions.'),
});

export const ForgotPasswordValidationSchema = Yup.object().shape({
    email: Yup.string()
        .trim()
        .email('Please enter a valid email address.')
        .required('Email is required.'),
});
